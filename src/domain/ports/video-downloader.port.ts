import type { DownloadProgress } from "../value-objects/download-progress.ts";

export interface VideoDownloader {
  download(
    videoId: string,
    outputPath: string,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void>;
}
