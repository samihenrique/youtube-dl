import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type {
  SegmentDownloader,
  SegmentDownloaderOptions,
} from "../../domain/ports/segment-downloader.port.ts";
import { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

const AUTH_ERROR_CODES = new Set([401, 403]);
const RETRY_BACKOFF_BASE_MS = 1_000;

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
    const totalSegments = Math.max(0, options.endSq - options.startSq + 1);
    const startedAt = Date.now();

    let downloadedSegments = 0;
    let processedSegments = 0;
    let downloadedBytes = 0;
    let nextSqToWrite = options.startSq;
    const pendingBuffer = new Map<number, Uint8Array>();
    const missingSegments = new Set<number>();
    const urlHolder = new RefreshableUrl(
      options.segmentTemplateUrl,
      options.refreshVideoUrl,
    );

    const ffmpeg = Bun.spawn(
      [
        ffmpegBinary,
        "-hide_banner",
        "-loglevel",
        "warning",
        "-fflags",
        "+genpts+discardcorrupt",
        "-y",
        "-i",
        "pipe:0",
        "-c",
        "copy",
        "-f",
        "mp4",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        options.outputPath,
      ],
      { stdin: "pipe", stdout: "ignore", stderr: "inherit" },
    );

    function drainBuffer(): void {
      while (
        pendingBuffer.has(nextSqToWrite) || missingSegments.has(nextSqToWrite)
      ) {
        if (missingSegments.has(nextSqToWrite)) {
          missingSegments.delete(nextSqToWrite);
          nextSqToWrite++;
          continue;
        }
        const data = pendingBuffer.get(nextSqToWrite)!;
        pendingBuffer.delete(nextSqToWrite);
        ffmpeg.stdin.write(data);
        nextSqToWrite++;
      }
    }

    const firstFetchSq = Math.max(
      options.startSq,
      (options.knownMissingUntilSq ?? options.startSq - 1) + 1,
    );
    if (firstFetchSq > options.startSq) {
      for (let sq = options.startSq; sq < firstFetchSq; sq++) {
        missingSegments.add(sq);
      }
      processedSegments = firstFetchSq - options.startSq;
      drainBuffer();
      onProgress(
        new DownloadProgress(
          downloadedBytes,
          options.estimatedTotalBytes ?? null,
          Date.now() - startedAt,
          processedSegments,
          totalSegments,
        ),
      );
    }

    await this.runWithWorkerPool(
      firstFetchSq,
      options.endSq,
      options.concurrency,
      async (currentSq) => {
        const data = await this.fetchHlsSegmentWithRefresh(
          urlHolder,
          currentSq,
          options.retries,
          options.timeoutSeconds,
        );

        if (data) {
          downloadedBytes += data.byteLength;
          downloadedSegments++;
          pendingBuffer.set(currentSq, data);
        } else {
          missingSegments.add(currentSq);
        }
        processedSegments++;
        drainBuffer();

        onProgress(
          new DownloadProgress(
            downloadedBytes,
            options.estimatedTotalBytes ?? null,
            Date.now() - startedAt,
            processedSegments,
            totalSegments,
          ),
        );
      },
    );

    drainBuffer();
    await ffmpeg.stdin.end();

    if (downloadedSegments === 0) {
      throw new DownloadFailedError(
        "HLS: nenhum segmento de mídia foi baixado.",
      );
    }

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
          options.estimatedTotalBytes ?? null,
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

      const mux = Bun.spawn(
        [
          ffmpegBinary,
          "-hide_banner",
          "-loglevel",
          "warning",
          "-fflags",
          "+genpts+discardcorrupt",
          "-i",
          videoTmpPath,
          "-fflags",
          "+genpts+discardcorrupt",
          "-i",
          audioTmpPath,
          "-c",
          "copy",
          "-avoid_negative_ts",
          "make_zero",
          "-movflags",
          "+faststart",
          "-y",
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
    const file = Bun.file(outputPath);
    const writer = file.writer();

    let downloadedBytes = 0;
    let downloadedSegments = 0;
    let processedSegments = 0;
    let nextSqToWrite = startSq;
    const pendingBuffer = new Map<number, Uint8Array>();
    const missingSegments = new Set<number>();

    const initSegment = await this.fetchDashSegmentWithRefresh(
      urlHolder,
      0,
      options.retries,
      options.timeoutSeconds,
    );
    if (!initSegment) {
      await writer.end();
      throw new DownloadFailedError(
        "DASH: falha ao baixar segmento de inicialização (sq=0).",
      );
    }
    writer.write(initSegment);
    downloadedBytes += initSegment.byteLength;

    function drainBuffer(): void {
      while (
        pendingBuffer.has(nextSqToWrite) || missingSegments.has(nextSqToWrite)
      ) {
        if (missingSegments.has(nextSqToWrite)) {
          missingSegments.delete(nextSqToWrite);
          nextSqToWrite++;
          continue;
        }
        const data = pendingBuffer.get(nextSqToWrite)!;
        pendingBuffer.delete(nextSqToWrite);
        writer.write(data);
        nextSqToWrite++;
      }
    }

    const firstFetchSq = Math.max(
      startSq,
      (options.knownMissingUntilSq ?? startSq - 1) + 1,
    );
    if (firstFetchSq > startSq) {
      for (let sq = startSq; sq < firstFetchSq; sq++) {
        missingSegments.add(sq);
      }
      processedSegments = firstFetchSq - startSq;
      drainBuffer();
      onProgress(downloadedBytes, processedSegments);
    }

    await this.runWithWorkerPool(
      firstFetchSq,
      endSq,
      options.concurrency,
      async (currentSq) => {
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
        } else {
          missingSegments.add(currentSq);
        }
        processedSegments++;
        drainBuffer();

        onProgress(downloadedBytes, processedSegments);
      },
    );

    drainBuffer();
    await writer.end();

    if (downloadedSegments === 0) {
      throw new DownloadFailedError(
        "DASH: nenhum segmento de mídia foi baixado.",
      );
    }
  }

  private async runWithWorkerPool(
    startSq: number,
    endSq: number,
    concurrency: number,
    worker: (sq: number) => Promise<void>,
  ): Promise<void> {
    if (endSq < startSq) return;

    const totalSegments = endSq - startSq + 1;
    const workerCount = Math.max(1, Math.min(concurrency, totalSegments));
    let nextSq = startSq;

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentSq = nextSq++;
        if (currentSq > endSq) return;
        await worker(currentSq);
      }
    });

    await Promise.all(workers);
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

        if (sq === 0 && response.status === 404) {
          return null;
        }

        if (response.status === 404 || response.status === 410) {
          return null;
        }

        if (AUTH_ERROR_CODES.has(response.status)) {
          const refreshed = await urlHolder.refresh(true);
          if (refreshed) {
            const retryUrl = this.buildUrl(urlHolder.current, sq, "dash");
            const retryResp = await fetch(retryUrl, {
              signal: controller.signal,
            });
            if (retryResp.ok) {
              return new Uint8Array(await retryResp.arrayBuffer());
            }
            if (sq === 0 && retryResp.status === 404) {
              return null;
            }
            if (retryResp.status === 404 || retryResp.status === 410) {
              return null;
            }
            lastError = new Error(`HTTP ${retryResp.status}`);
          } else {
            lastError = new Error(`HTTP ${response.status}`);
          }
          if (attempt < maxRetries) {
            await this.delayRetry(attempt);
          }
          continue;
        }

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          if (attempt < maxRetries) {
            await this.delayRetry(attempt);
          }
          continue;
        }

        return new Uint8Array(await response.arrayBuffer());
      } catch (error: unknown) {
        lastError = error;
        if (attempt < maxRetries) {
          await this.delayRetry(attempt);
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    if (sq === 0 && message === "HTTP 404") {
      return null;
    }
    if (message === "HTTP 401" || message === "HTTP 403") {
      throw new DownloadFailedError(
        `DASH: falha de autenticação ao baixar segmento sq=${sq} (${message}).`,
      );
    }
    console.error(
      `[warn] Segmento sq=${sq} falhou após ${maxRetries + 1} tentativas: ${message}`,
    );
    return null;
  }

  private async fetchHlsSegmentWithRefresh(
    urlHolder: RefreshableUrl,
    sq: number,
    maxRetries: number,
    timeoutSeconds: number,
  ): Promise<Uint8Array | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const segmentUrl = this.buildUrl(urlHolder.current, sq, "hls");
      try {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          timeoutSeconds * 1000,
        );

        const response = await fetch(segmentUrl, { signal: controller.signal });
        clearTimeout(timer);

        if (response.status === 404 || response.status === 410) {
          return null;
        }

        if (AUTH_ERROR_CODES.has(response.status)) {
          const refreshed = await urlHolder.refresh(true);
          if (refreshed) {
            const retryUrl = this.buildUrl(urlHolder.current, sq, "hls");
            const retryResp = await fetch(retryUrl, {
              signal: controller.signal,
            });
            if (retryResp.ok) {
              return new Uint8Array(await retryResp.arrayBuffer());
            }
            if (retryResp.status === 404 || retryResp.status === 410) {
              return null;
            }
            lastError = new Error(`HTTP ${retryResp.status}`);
          } else {
            lastError = new Error(`HTTP ${response.status}`);
          }
          if (attempt < maxRetries) {
            await this.delayRetry(attempt);
          }
          continue;
        }

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          if (attempt < maxRetries) {
            await this.delayRetry(attempt);
          }
          continue;
        }

        return new Uint8Array(await response.arrayBuffer());
      } catch (error: unknown) {
        lastError = error;
        if (attempt < maxRetries) {
          await this.delayRetry(attempt);
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    if (message === "HTTP 404" || message === "HTTP 410") {
      return null;
    }
    if (message === "HTTP 401" || message === "HTTP 403") {
      throw new DownloadFailedError(
        `HLS: falha de autenticação ao baixar segmento sq=${sq} (${message}).`,
      );
    }
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
    if (template.includes("/playlist/index.m3u8/sq/")) {
      const normalized = template.replace(
        /(\/playlist\/index\.m3u8\/sq\/)\d+(?:\/.*)?$/,
        `$1${sq}`,
      );
      if (normalized !== template) {
        return normalized;
      }
    }
    return template.replace(/\/sq\/\d+\//, `/sq/${sq}/`);
  }

  private async delayRetry(attempt: number): Promise<void> {
    await new Promise((r) =>
      setTimeout(r, RETRY_BACKOFF_BASE_MS * (attempt + 1)),
    );
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
  }

  get current(): string {
    return this._current;
  }

  async refresh(force = false): Promise<boolean> {
    if (!this._refreshFn) return false;

    const now = Date.now();
    if (!force && now - this._lastRefreshAt < 5_000) {
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

  private async _doRefresh(): Promise<boolean> {
    try {
      this._current = await this._refreshFn!();
      this._lastRefreshAt = Date.now();
      return true;
    } catch {
      return false;
    }
  }
}
