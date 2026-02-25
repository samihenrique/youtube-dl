import { describe, expect, test, mock } from "bun:test";
import { ConvertMediaUseCase } from "./convert-media.use-case.ts";
import type { MediaConverter } from "../../domain/ports/media-converter.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { AudioCodec } from "../../domain/enums/audio-codec.ts";
import { OutputFormat } from "../../domain/enums/output-format.ts";
import { VideoCodec } from "../../domain/enums/video-codec.ts";
import { TimeRange } from "../../domain/value-objects/time-range.ts";
import { ConversionFailedError } from "../../domain/errors/conversion-failed.error.ts";

function createMockConverter(): MediaConverter {
  return { convert: mock(async () => {}) };
}

function createMockReporter(): ProgressReporter {
  return {
    start: mock(() => {}),
    update: mock(() => {}),
    finish: mock(() => {}),
    error: mock(() => {}),
  };
}

const sampleTask: ConversionTask = {
  outputFormat: OutputFormat.Mp4,
  extractAudio: null,
  videoCodec: VideoCodec.H264,
  audioCodec: AudioCodec.Aac,
  videoBitrate: null,
  audioBitrate: null,
  resolution: null,
  fps: null,
  timeRange: new TimeRange(null, null),
  noAudio: false,
  noVideo: false,
};

describe("ConvertMediaUseCase", () => {
  test("converte com sucesso", async () => {
    const converter = createMockConverter();
    const reporter = createMockReporter();
    const useCase = new ConvertMediaUseCase(converter, reporter);

    const result = await useCase.execute(
      "/tmp/input.mp4",
      "/tmp/output.mkv",
      sampleTask,
    );

    expect(result).toBe("/tmp/output.mkv");
    expect(converter.convert).toHaveBeenCalledTimes(1);
    expect(reporter.start).toHaveBeenCalledTimes(1);
    expect(reporter.finish).toHaveBeenCalledTimes(1);
  });

  test("propaga erro como ConversionFailedError", async () => {
    const converter: MediaConverter = {
      convert: mock(async () => {
        throw new Error("codec not found");
      }),
    };
    const reporter = createMockReporter();
    const useCase = new ConvertMediaUseCase(converter, reporter);

    await expect(
      useCase.execute("/tmp/input.mp4", "/tmp/output.mkv", sampleTask),
    ).rejects.toThrow(ConversionFailedError);

    expect(reporter.error).toHaveBeenCalledTimes(1);
  });
});
