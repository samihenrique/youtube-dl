import type { VideoInfo } from "../../domain/entities/video-info.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { FilenamePattern } from "../../domain/enums/filename-pattern.ts";
import { OverwriteBehavior } from "../../domain/enums/overwrite-behavior.ts";

export interface SmartDefaults {
  quality: string;
  liveMode: DownloadMode;
  outputDir: string;
  filenamePattern: FilenamePattern;
  overwrite: OverwriteBehavior;
  concurrency: number;
  retries: number;
  timeout: number;
}

export function getSmartDefaults(videoInfo: VideoInfo): SmartDefaults {
  const isLive =
    videoInfo.type === VideoType.Live ||
    videoInfo.type === VideoType.PostLiveDvr;

  return {
    quality: "best",
    liveMode: isLive ? DownloadMode.DvrStart : DownloadMode.DvrStart,
    outputDir: "./downloads",
    filenamePattern: FilenamePattern.TitleId,
    overwrite: OverwriteBehavior.Rename,
    concurrency: 4,
    retries: isLive ? 5 : 3,
    timeout: isLive ? 45 : 30,
  };
}

export function isFfmpegAvailable(): boolean {
  try {
    const result = Bun.spawnSync(["ffmpeg", "-version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return result.exitCode === 0;
  } catch {
    try {
      const ffmpegStatic = require("ffmpeg-static") as string;
      const result = Bun.spawnSync([ffmpegStatic, "-version"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}
