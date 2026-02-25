import type { DownloadProgress } from "../value-objects/download-progress.ts";

export interface ProgressReporter {
  start(label: string): void;
  update(progress: DownloadProgress): void;
  finish(message: string): void;
  error(message: string): void;
  phase(current: number, total: number, label: string): void;
  info(message: string): void;
  warn(message: string): void;
}
