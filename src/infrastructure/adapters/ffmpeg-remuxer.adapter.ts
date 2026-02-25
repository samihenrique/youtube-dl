import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type {
  MediaRemuxer,
  MediaRemuxerOptions,
} from "../../domain/ports/media-remuxer.port.ts";
import { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

type FfmpegProgressData = Record<string, string>;

export class FfmpegRemuxerAdapter implements MediaRemuxer {
  async remux(
    options: MediaRemuxerOptions,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const ffmpegBinary = await resolveFfmpegBinary();

    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-nostats",
      "-stats_period",
      "1",
      "-progress",
      "pipe:1",
      "-y",
      "-i",
      options.manifestUrl,
    ];

    if (
      options.maxDurationSeconds !== undefined &&
      Number.isFinite(options.maxDurationSeconds) &&
      options.maxDurationSeconds > 0
    ) {
      args.push("-t", String(options.maxDurationSeconds));
    }

    args.push(
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "+faststart",
      options.outputPath,
    );

    const ffmpeg = Bun.spawn([ffmpegBinary, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
    });

    const startedAt = Date.now();
    await this.consumeProgress(
      ffmpeg.stdout,
      startedAt,
      options.maxDurationSeconds,
      onProgress,
    );

    const exitCode = await ffmpeg.exited;
    if (exitCode !== 0) {
      throw new DownloadFailedError(
        `ffmpeg falhou ao remuxar a live (exit code ${exitCode})`,
      );
    }
  }

  private async consumeProgress(
    stream: ReadableStream<Uint8Array>,
    startedAt: number,
    maxDuration: number | undefined,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let progress: FfmpegProgressData = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf("\n");

      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");

        if (!line) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;

        const key = line.slice(0, eq);
        const val = line.slice(eq + 1);
        progress[key] = val;

        if (key === "progress") {
          const seconds = this.parseOutTimeSeconds(progress);
          const totalSize = Number(progress["total_size"] ?? 0);

          const totalBytes = maxDuration
            ? totalSize > 0
              ? Math.round((totalSize / Math.max(1, seconds)) * maxDuration)
              : null
            : null;

          onProgress(
            new DownloadProgress(
              totalSize,
              totalBytes,
              Date.now() - startedAt,
            ),
          );
          progress = {};
        }
      }
    }
  }

  private parseOutTimeSeconds(progress: FfmpegProgressData): number {
    const raw = progress["out_time_ms"] ?? progress["out_time_us"];
    if (raw) {
      const us = Number(raw);
      if (Number.isFinite(us) && us >= 0) return us / 1_000_000;
    }

    const outTime = progress["out_time"];
    if (!outTime) return 0;

    const parts = outTime.split(":");
    if (parts.length !== 3) return 0;

    const [h, m, s] = parts.map(Number);
    if (
      !Number.isFinite(h) ||
      !Number.isFinite(m) ||
      !Number.isFinite(s)
    ) {
      return 0;
    }

    return h! * 3600 + m! * 60 + s!;
  }
}
