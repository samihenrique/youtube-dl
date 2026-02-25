import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { AudioCodec } from "../../domain/enums/audio-codec.ts";
import { VideoCodec } from "../../domain/enums/video-codec.ts";
import { ConversionFailedError } from "../../domain/errors/conversion-failed.error.ts";
import type { MediaConverter } from "../../domain/ports/media-converter.port.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

const VIDEO_CODEC_MAP: Record<string, string> = {
  copy: "copy",
  h264: "libx264",
  h265: "libx265",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
};

const AUDIO_CODEC_MAP: Record<string, string> = {
  copy: "copy",
  aac: "aac",
  opus: "libopus",
  mp3: "libmp3lame",
  flac: "flac",
};

export class FfmpegConverterAdapter implements MediaConverter {
  async convert(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
  ): Promise<void> {
    const ffmpegBinary = await resolveFfmpegBinary();
    const args = this.buildArgs(inputPath, outputPath, task);

    const proc = Bun.spawn([ffmpegBinary, ...args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new ConversionFailedError(
        `ffmpeg saiu com código ${exitCode}.\n${stderr.slice(-500)}`,
      );
    }
  }

  private buildArgs(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
  ): string[] {
    const args = ["-hide_banner", "-loglevel", "warning", "-y"];

    if (!task.timeRange.isEmpty) {
      args.push(...task.timeRange.toFfmpegArgs());
    }

    args.push("-i", inputPath);

    if (task.extractAudio) {
      args.push("-vn");
      const codec = AUDIO_CODEC_MAP[task.audioCodec] ?? "copy";
      args.push("-c:a", codec);
    } else {
      if (task.noVideo) {
        args.push("-vn");
      } else {
        const vCodec = VIDEO_CODEC_MAP[task.videoCodec] ?? "copy";
        args.push("-c:v", vCodec);

        if (task.resolution && task.videoCodec !== VideoCodec.Copy) {
          args.push("-vf", `scale=${this.parseResolution(task.resolution)}`);
        }

        if (task.fps !== null && task.videoCodec !== VideoCodec.Copy) {
          args.push("-r", String(task.fps));
        }

        if (task.videoBitrate && task.videoCodec !== VideoCodec.Copy) {
          args.push("-b:v", task.videoBitrate.toFfmpegArg());
        }
      }

      if (task.noAudio) {
        args.push("-an");
      } else {
        const aCodec = AUDIO_CODEC_MAP[task.audioCodec] ?? "copy";
        args.push("-c:a", aCodec);

        if (task.audioBitrate && task.audioCodec !== AudioCodec.Copy) {
          args.push("-b:a", task.audioBitrate.toFfmpegArg());
        }
      }
    }

    args.push("-movflags", "+faststart", outputPath);
    return args;
  }

  private parseResolution(resolution: string): string {
    const presetMatch = /^(\d+)p$/i.exec(resolution);
    if (presetMatch) {
      return `-2:${presetMatch[1]}`;
    }

    const wxhMatch = /^(\d+)x(\d+)$/i.exec(resolution);
    if (wxhMatch) {
      return `${wxhMatch[1]}:${wxhMatch[2]}`;
    }

    return resolution;
  }
}
