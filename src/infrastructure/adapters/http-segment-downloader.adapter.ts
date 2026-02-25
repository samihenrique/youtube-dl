import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type {
  SegmentDownloader,
  SegmentDownloaderOptions,
} from "../../domain/ports/segment-downloader.port.ts";
import { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { Semaphore } from "../concurrency/semaphore.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

export class HttpSegmentDownloaderAdapter implements SegmentDownloader {
  async download(
    options: SegmentDownloaderOptions,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const ffmpegBinary = await resolveFfmpegBinary();
    const semaphore = new Semaphore(options.concurrency);
    const totalSegments = Math.max(0, options.endSq - options.startSq + 1);
    const startedAt = Date.now();

    let downloadedSegments = 0;
    let downloadedBytes = 0;
    let nextSqToWrite = options.startSq;
    const pendingBuffer = new Map<number, Uint8Array>();

    const ffmpeg = Bun.spawn(
      [
        ffmpegBinary,
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-i",
        "pipe:0",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        options.outputPath,
      ],
      { stdin: "pipe", stdout: "ignore", stderr: "inherit" },
    );

    function drainBuffer(): void {
      while (pendingBuffer.has(nextSqToWrite)) {
        const data = pendingBuffer.get(nextSqToWrite)!;
        pendingBuffer.delete(nextSqToWrite);
        ffmpeg.stdin.write(data);
        nextSqToWrite++;
      }
    }

    const tasks: Array<Promise<void>> = [];

    for (let sq = options.startSq; sq <= options.endSq; sq++) {
      const currentSq = sq;
      tasks.push(
        semaphore.run(async () => {
          const segmentUrl = this.buildUrl(
            options.segmentTemplateUrl,
            currentSq,
          );
          const data = await this.fetchSegmentWithRetry(
            segmentUrl,
            options.retries,
            options.timeoutSeconds,
          );

          if (data) {
            downloadedBytes += data.byteLength;
            downloadedSegments++;
            pendingBuffer.set(currentSq, data);
            drainBuffer();
          }

          onProgress(
            new DownloadProgress(
              downloadedBytes,
              null,
              Date.now() - startedAt,
              downloadedSegments,
              totalSegments,
            ),
          );
        }),
      );
    }

    await Promise.all(tasks);
    drainBuffer();
    await ffmpeg.stdin.end();

    const exitCode = await ffmpeg.exited;
    if (exitCode !== 0) {
      throw new DownloadFailedError(
        `ffmpeg falhou ao remuxar segmentos (exit code ${exitCode})`,
      );
    }
  }

  private async fetchSegmentWithRetry(
    url: string,
    maxRetries: number,
    timeoutSeconds: number,
  ): Promise<Uint8Array | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          timeoutSeconds * 1000,
        );

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        return new Uint8Array(await response.arrayBuffer());
      } catch (error: unknown) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`[warn] Segmento falhou após ${maxRetries + 1} tentativas: ${message}`);
    return null;
  }

  private buildUrl(template: string, sq: number): string {
    return template.replace(/\/sq\/\d+\//, `/sq/${sq}/`);
  }
}
