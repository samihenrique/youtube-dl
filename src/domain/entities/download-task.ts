import type { DownloadMode } from "../enums/download-mode.ts";
import type { FilenamePattern } from "../enums/filename-pattern.ts";
import type { OverwriteBehavior } from "../enums/overwrite-behavior.ts";
import type { ConversionTask } from "./conversion-task.ts";
import type { VideoInfo } from "./video-info.ts";

export interface DownloadTask {
  readonly videoInfo: VideoInfo;
  readonly outputDir: string;
  readonly filenamePattern: FilenamePattern;
  readonly overwrite: OverwriteBehavior;
  readonly concurrency: number;
  readonly maxDurationSeconds: number | null;
  readonly rateLimitBytesPerSecond: number | null;
  readonly retries: number;
  readonly timeoutSeconds: number;
  readonly liveMode: DownloadMode;
  readonly qualityLabel: string;
  readonly conversion: ConversionTask | null;
}
