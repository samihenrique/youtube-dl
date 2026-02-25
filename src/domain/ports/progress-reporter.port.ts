import type { DownloadProgress } from "../value-objects/download-progress.ts";

export interface ProgressReporter {
  start(label: string): void;
  update(progress: DownloadProgress): void;
  finish(message: string): void;
  error(message: string): void;
}
