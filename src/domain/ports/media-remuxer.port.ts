import type { DownloadProgress } from "../value-objects/download-progress.ts";

export interface MediaRemuxerOptions {
  readonly manifestUrl: string;
  readonly outputPath: string;
  readonly maxDurationSeconds?: number;
}

export interface MediaRemuxer {
  remux(
    options: MediaRemuxerOptions,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void>;
}
