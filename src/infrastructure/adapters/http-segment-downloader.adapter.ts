import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type {
  SegmentDownloader,
  SegmentDownloaderOptions,
} from "../../domain/ports/segment-downloader.port.ts";
import { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { Semaphore } from "../concurrency/semaphore.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

const AUTH_ERROR_CODES = new Set([401, 403]);
const TOKEN_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export class HttpSegmentDownloaderAdapter implements SegmentDownloader {
  async download(
    options: SegmentDownloaderOptions,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    if (options.urlMode === "dash" && options.audioTemplateUrl) {
      await this.downloadDash(options, onProgress);
    } else {
      await this.downloadHls(options, onProgress);
    }
  }

  private async downloadHls(
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
            "hls",
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

  private async downloadDash(
    options: SegmentDownloaderOptions,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const ffmpegBinary = await resolveFfmpegBinary();
    const totalSegments = Math.max(0, options.endSq - options.startSq + 1);
    const startedAt = Date.now();

    let videoBytes = 0;
    let audioBytes = 0;
    let videoSegs = 0;
    let audioSegs = 0;

    const basePath = options.outputPath.replace(/\.[^.]+$/, "");
    const videoTmpPath = `${basePath}.video.mp4`;
    const audioTmpPath = `${basePath}.audio.m4a`;

    const emitProgress = () => {
      const completedSegs = Math.min(videoSegs, audioSegs);
      onProgress(
        new DownloadProgress(
          videoBytes + audioBytes,
          null,
          Date.now() - startedAt,
          completedSegs,
          totalSegments,
        ),
      );
    };

    try {
      const videoConcurrency = Math.max(
        1,
        Math.ceil(options.concurrency * 0.75),
      );
      const audioConcurrency = Math.max(
        1,
        options.concurrency - videoConcurrency,
      );

      const videoUrlHolder = new RefreshableUrl(
        options.segmentTemplateUrl,
        options.refreshVideoUrl,
      );
      const audioUrlHolder = new RefreshableUrl(
        options.audioTemplateUrl!,
        options.refreshAudioUrl,
      );

      await Promise.all([
        this.downloadDashStream(
          videoUrlHolder,
          options.startSq,
          options.endSq,
          videoTmpPath,
          { ...options, concurrency: videoConcurrency },
          (bytes, segs) => {
            videoBytes = bytes;
            videoSegs = segs;
            emitProgress();
          },
        ),
        this.downloadDashStream(
          audioUrlHolder,
          options.startSq,
          options.endSq,
          audioTmpPath,
          { ...options, concurrency: audioConcurrency },
          (bytes, segs) => {
            audioBytes = bytes;
            audioSegs = segs;
            emitProgress();
          },
        ),
      ]);

      console.log("[dash] Muxando vídeo + áudio...");

      const mux = Bun.spawn(
        [
          ffmpegBinary,
          "-hide_banner",
          "-loglevel",
          "warning",
          "-y",
          "-i",
          videoTmpPath,
          "-i",
          audioTmpPath,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          options.outputPath,
        ],
        { stdout: "ignore", stderr: "inherit" },
      );

      const muxExit = await mux.exited;
      if (muxExit !== 0) {
        throw new DownloadFailedError(
          `ffmpeg falhou ao muxar vídeo+áudio (exit code ${muxExit})`,
        );
      }
    } finally {
      const fs = await import("node:fs");
      for (const tmpPath of [videoTmpPath, audioTmpPath]) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          /* cleanup best-effort */
        }
      }
    }
  }

  private async downloadDashStream(
    urlHolder: RefreshableUrl,
    startSq: number,
    endSq: number,
    outputPath: string,
    options: SegmentDownloaderOptions,
    onProgress: (bytes: number, segments: number) => void,
  ): Promise<void> {
    const semaphore = new Semaphore(options.concurrency);
    const file = Bun.file(outputPath);
    const writer = file.writer();

    let downloadedBytes = 0;
    let downloadedSegments = 0;
    let nextSqToWrite = startSq;
    const pendingBuffer = new Map<number, Uint8Array>();

    function drainBuffer(): void {
      while (pendingBuffer.has(nextSqToWrite)) {
        const data = pendingBuffer.get(nextSqToWrite)!;
        pendingBuffer.delete(nextSqToWrite);
        writer.write(data);
        nextSqToWrite++;
      }
    }

    const tasks: Array<Promise<void>> = [];

    for (let sq = startSq; sq <= endSq; sq++) {
      const currentSq = sq;
      tasks.push(
        semaphore.run(async () => {
          const data = await this.fetchDashSegmentWithRefresh(
            urlHolder,
            currentSq,
            options.retries,
            options.timeoutSeconds,
          );

          if (data) {
            downloadedBytes += data.byteLength;
            downloadedSegments++;
            pendingBuffer.set(currentSq, data);
            drainBuffer();
          }

          onProgress(downloadedBytes, downloadedSegments);
        }),
      );
    }

    await Promise.all(tasks);
    drainBuffer();
    await writer.end();
  }

  private async fetchDashSegmentWithRefresh(
    urlHolder: RefreshableUrl,
    sq: number,
    maxRetries: number,
    timeoutSeconds: number,
  ): Promise<Uint8Array | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const segmentUrl = this.buildUrl(urlHolder.current, sq, "dash");

      try {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          timeoutSeconds * 1000,
        );

        const response = await fetch(segmentUrl, {
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (AUTH_ERROR_CODES.has(response.status)) {
          const refreshed = await urlHolder.refresh();
          if (refreshed) {
            const retryUrl = this.buildUrl(urlHolder.current, sq, "dash");
            const retryResp = await fetch(retryUrl);
            if (retryResp.ok) {
              return new Uint8Array(await retryResp.arrayBuffer());
            }
          }
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

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
    console.error(
      `[warn] Segmento falhou após ${maxRetries + 1} tentativas: ${message}`,
    );
    return null;
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
    console.error(
      `[warn] Segmento falhou após ${maxRetries + 1} tentativas: ${message}`,
    );
    return null;
  }

  private buildUrl(
    template: string,
    sq: number,
    mode: "hls" | "dash",
  ): string {
    if (mode === "dash") {
      const url = new URL(template);
      url.searchParams.set("sq", String(sq));
      return url.toString();
    }
    return template.replace(/\/sq\/\d+\//, `/sq/${sq}/`);
  }
}

class RefreshableUrl {
  private _current: string;
  private readonly _refreshFn?: () => Promise<string>;
  private _lastRefreshAt = 0;
  private _refreshPromise: Promise<boolean> | null = null;

  constructor(initialUrl: string, refreshFn?: () => Promise<string>) {
    this._current = initialUrl;
    this._refreshFn = refreshFn;
    this._lastRefreshAt = Date.now();
  }

  get current(): string {
    return this._current;
  }

  async refresh(): Promise<boolean> {
    if (!this._refreshFn) return false;

    const now = Date.now();
    if (now - this._lastRefreshAt < 5_000) {
      return false;
    }

    if (this._refreshPromise) {
      return this._refreshPromise;
    }

    this._refreshPromise = this._doRefresh();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  needsProactiveRefresh(): boolean {
    return Date.now() - this._lastRefreshAt > TOKEN_REFRESH_INTERVAL_MS;
  }

  private async _doRefresh(): Promise<boolean> {
    try {
      console.log("[dash] Renovando URL de download...");
      this._current = await this._refreshFn!();
      this._lastRefreshAt = Date.now();
      return true;
    } catch {
      return false;
    }
  }
}
