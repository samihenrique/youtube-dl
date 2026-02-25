import { describe, expect, test, mock } from "bun:test";
import { DownloadVideoUseCase } from "./download-video.use-case.ts";
import type { VideoDownloader } from "../../domain/ports/video-downloader.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { DownloadTask } from "../../domain/entities/download-task.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { FilenamePattern } from "../../domain/enums/filename-pattern.ts";
import { OverwriteBehavior } from "../../domain/enums/overwrite-behavior.ts";
import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";

function createMockDownloader(): VideoDownloader {
  return {
    download: mock(async () => {}),
  };
}

function createMockReporter(): ProgressReporter {
  return {
    start: mock(() => {}),
    update: mock(() => {}),
    finish: mock(() => {}),
    error: mock(() => {}),
  };
}

function createTask(
  overrides: Partial<DownloadTask> = {},
): DownloadTask {
  return {
    videoInfo: {
      id: "dQw4w9WgXcQ",
      title: "Test Video",
      type: VideoType.Video,
      durationSeconds: 300,
      hlsManifestUrl: null,
      qualities: [],
      dashFormats: [],
    },
    outputDir: "/tmp/test-downloads",
    filenamePattern: FilenamePattern.TitleId,
    overwrite: OverwriteBehavior.Overwrite,
    concurrency: 8,
    maxDurationSeconds: null,
    rateLimitBytesPerSecond: null,
    retries: 3,
    timeoutSeconds: 30,
    liveMode: DownloadMode.DvrStart,
    qualityLabel: "best",
    conversion: null,
    ...overrides,
  };
}

describe("DownloadVideoUseCase", () => {
  test("faz download com sucesso", async () => {
    const downloader = createMockDownloader();
    const reporter = createMockReporter();
    const useCase = new DownloadVideoUseCase(downloader, reporter);
    const task = createTask();

    const outputPath = await useCase.execute(task);

    expect(outputPath).toContain("Test Video");
    expect(downloader.download).toHaveBeenCalledTimes(1);
    expect(reporter.start).toHaveBeenCalledTimes(1);
    expect(reporter.finish).toHaveBeenCalledTimes(1);
  });

  test("lança erro para tipo live", async () => {
    const downloader = createMockDownloader();
    const reporter = createMockReporter();
    const useCase = new DownloadVideoUseCase(downloader, reporter);
    const task = createTask({
      videoInfo: {
        id: "abc12345678",
        title: "Live",
        type: VideoType.Live,
        durationSeconds: null,
        hlsManifestUrl: "https://example.com/m.m3u8",
        qualities: [],
        dashFormats: [],
      },
    });

    await expect(useCase.execute(task)).rejects.toThrow(DownloadFailedError);
  });

  test("propaga erro do downloader como DownloadFailedError", async () => {
    const downloader: VideoDownloader = {
      download: mock(async () => {
        throw new Error("network error");
      }),
    };
    const reporter = createMockReporter();
    const useCase = new DownloadVideoUseCase(downloader, reporter);

    await expect(useCase.execute(createTask())).rejects.toThrow(
      DownloadFailedError,
    );
    expect(reporter.error).toHaveBeenCalledTimes(1);
  });
});
