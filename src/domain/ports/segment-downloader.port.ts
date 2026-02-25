import type { DownloadProgress } from "../value-objects/download-progress.ts";

export interface SegmentDownloaderOptions {
  readonly segmentTemplateUrl: string;
  readonly audioTemplateUrl?: string;
  readonly startSq: number;
  readonly endSq: number;
  readonly outputPath: string;
  readonly concurrency: number;
  readonly retries: number;
  readonly timeoutSeconds: number;
  readonly urlMode: "hls" | "dash";
  readonly refreshVideoUrl?: () => Promise<string>;
  readonly refreshAudioUrl?: () => Promise<string>;
}

export interface SegmentDownloader {
  download(
    options: SegmentDownloaderOptions,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void>;
}
