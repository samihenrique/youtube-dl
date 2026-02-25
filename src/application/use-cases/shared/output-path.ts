import { existsSync, mkdirSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { DownloadTask } from "../../../domain/entities/download-task.ts";
import { FilenamePattern } from "../../../domain/enums/filename-pattern.ts";
import { OverwriteBehavior } from "../../../domain/enums/overwrite-behavior.ts";

function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFilename(
  title: string,
  videoId: string,
  pattern: FilenamePattern,
): string {
  const safeTitle = sanitizeFilename(title) || `youtube-${videoId}`;

  switch (pattern) {
    case FilenamePattern.IdTitle:
      return `${videoId}-${safeTitle}.mp4`;
    case FilenamePattern.TitleOnly:
      return `${safeTitle}.mp4`;
    case FilenamePattern.TitleId:
      return `${safeTitle}-${videoId}.mp4`;
  }
}

function findUniqueFilename(filePath: string): string {
  if (!existsSync(filePath)) return filePath;

  const ext = extname(filePath);
  const base = basename(filePath, ext);
  const dir = resolve(filePath, "..");
  let counter = 1;

  while (existsSync(resolve(dir, `${base} (${counter})${ext}`))) {
    counter++;
  }

  return resolve(dir, `${base} (${counter})${ext}`);
}

export function buildOutputPath(task: DownloadTask): string {
  const dir = resolve(task.outputDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = buildFilename(
    task.videoInfo.title,
    task.videoInfo.id,
    task.filenamePattern,
  );

  return resolve(dir, filename);
}

/**
 * Returns the resolved output path considering overwrite behavior,
 * or `null` if the download should be skipped.
 */
export function resolveExistingFile(
  outputPath: string,
  behavior: OverwriteBehavior,
): string | null {
  if (!existsSync(outputPath)) return outputPath;

  switch (behavior) {
    case OverwriteBehavior.Skip:
      return null;
    case OverwriteBehavior.Overwrite:
      return outputPath;
    case OverwriteBehavior.Rename:
      return findUniqueFilename(outputPath);
  }
}
