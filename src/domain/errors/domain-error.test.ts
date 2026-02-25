import { describe, expect, test } from "bun:test";
import { DomainError } from "./domain-error.ts";
import { InvalidUrlError } from "./invalid-url.error.ts";
import { InvalidInputError } from "./invalid-input.error.ts";
import { DownloadFailedError } from "./download-failed.error.ts";
import { ConversionFailedError } from "./conversion-failed.error.ts";
import { FfmpegNotFoundError } from "./ffmpeg-not-found.error.ts";
import { VideoUnavailableError } from "./video-unavailable.error.ts";

describe("DomainError hierarchy", () => {
  test("InvalidUrlError has correct code and extends DomainError", () => {
    const err = new InvalidUrlError("https://invalid.com");
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("INVALID_URL");
    expect(err.name).toBe("InvalidUrlError");
    expect(err.message).toContain("invalid.com");
  });

  test("InvalidInputError carries field and constraint", () => {
    const err = new InvalidInputError("FPS", "deve ser entre 1 e 120");
    expect(err.code).toBe("INVALID_INPUT");
    expect(err.field).toBe("FPS");
    expect(err.constraint).toBe("deve ser entre 1 e 120");
    expect(err.message).toContain("FPS");
  });

  test("VideoUnavailableError preserves cause chain", () => {
    const original = new Error("network timeout");
    const err = new VideoUnavailableError("abc12345678", { cause: original });
    expect(err.code).toBe("VIDEO_UNAVAILABLE");
    expect(err.cause).toBe(original);
  });

  test("DownloadFailedError with cause", () => {
    const cause = new TypeError("fetch failed");
    const err = new DownloadFailedError("segmento corrompido", { cause });
    expect(err.code).toBe("DOWNLOAD_FAILED");
    expect(err.cause).toBe(cause);
  });

  test("ConversionFailedError", () => {
    const err = new ConversionFailedError("codec não suportado");
    expect(err.code).toBe("CONVERSION_FAILED");
    expect(err.message).toContain("codec não suportado");
  });

  test("FfmpegNotFoundError has actionable message", () => {
    const err = new FfmpegNotFoundError();
    expect(err.code).toBe("FFMPEG_NOT_FOUND");
    expect(err.message).toContain("ffmpeg");
    expect(err.message).toContain("https://");
  });
});
