import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { EncodingPreset } from "../../domain/enums/encoding-preset.ts";
import { FilenamePattern } from "../../domain/enums/filename-pattern.ts";
import { HardwareAccel } from "../../domain/enums/hardware-accel.ts";
import { OverwriteBehavior } from "../../domain/enums/overwrite-behavior.ts";
import { OutputFormat } from "../../domain/enums/output-format.ts";
import { AudioFormat } from "../../domain/enums/audio-format.ts";
import { VideoCodec } from "../../domain/enums/video-codec.ts";
import { AudioCodec } from "../../domain/enums/audio-codec.ts";
import { InvalidInputError } from "../../domain/errors/invalid-input.error.ts";

export interface ParsedArgs {
  url: string | null;
  quality: string | null;
  liveMode: DownloadMode;
  concurrency: number;
  maxDuration: number | null;
  rateLimit: string | null;
  retries: number;
  timeout: number;
  outputDir: string;
  filenamePattern: FilenamePattern;
  overwrite: OverwriteBehavior;
  convert: boolean;
  format: OutputFormat;
  extractAudio: AudioFormat | null;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  videoBitrate: string | null;
  audioBitrate: string | null;
  resolution: string | null;
  fps: number | null;
  trimStart: string | null;
  trimEnd: string | null;
  noAudio: boolean;
  noVideo: boolean;
  infoOnly: boolean;
  interactive: boolean;
  hardwareAccel: HardwareAccel;
  threads: number | null;
  preset: EncodingPreset;
}

function findFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseIntFlag(
  args: string[],
  flag: string,
  defaultVal: number,
  min: number,
  max: number,
  name: string,
): number {
  const raw = findFlag(args, flag);
  if (raw === null) return defaultVal;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new InvalidInputError(name, `deve ser inteiro entre ${min} e ${max}`);
  }
  return num;
}

function parseEnum<T extends string>(
  args: string[],
  flag: string,
  valid: readonly T[],
  defaultVal: T,
  name: string,
): T {
  const raw = findFlag(args, flag);
  if (raw === null) return defaultVal;
  if (!valid.includes(raw as T)) {
    throw new InvalidInputError(
      name,
      `deve ser um de: ${valid.join(", ")}`,
    );
  }
  return raw as T;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  const hasAnyFlag = args.some((a) => a.startsWith("--"));
  const interactive = !hasAnyFlag;

  const urlFromFlag = findFlag(args, "--url");
  const urlFromEnv = hasAnyFlag && !urlFromFlag
    ? (process.env["YOUTUBE_LIVE_URL"] ?? null)
    : null;

  return {
    url: urlFromFlag ?? urlFromEnv,
    quality: findFlag(args, "--quality"),
    liveMode: parseEnum(
      args,
      "--live-mode",
      [DownloadMode.DvrStart, DownloadMode.LiveNow],
      DownloadMode.DvrStart,
      "Modo live",
    ),
    concurrency: parseIntFlag(args, "--concurrency", 4, 1, 256, "Concorrência"),
    maxDuration: (() => {
      const raw = findFlag(args, "--max-duration");
      if (!raw) return null;
      const num = Number(raw);
      if (!Number.isInteger(num) || num <= 0) {
        throw new InvalidInputError(
          "Duração máxima",
          "deve ser um inteiro positivo",
        );
      }
      return num;
    })(),
    rateLimit: findFlag(args, "--rate-limit"),
    retries: parseIntFlag(args, "--retries", 3, 0, 20, "Retentativas"),
    timeout: parseIntFlag(args, "--timeout", 30, 5, 300, "Timeout"),
    outputDir: findFlag(args, "--output-dir") ?? "./downloads",
    filenamePattern: parseEnum(
      args,
      "--filename-pattern",
      [
        FilenamePattern.TitleId,
        FilenamePattern.IdTitle,
        FilenamePattern.TitleOnly,
      ],
      FilenamePattern.TitleId,
      "Padrão de nome",
    ),
    overwrite: parseEnum(
      args,
      "--overwrite",
      [
        OverwriteBehavior.Overwrite,
        OverwriteBehavior.Skip,
        OverwriteBehavior.Rename,
      ],
      OverwriteBehavior.Rename,
      "Comportamento de sobrescrita",
    ),
    convert: hasFlag(args, "--convert"),
    format: parseEnum(
      args,
      "--format",
      [
        OutputFormat.Mp4,
        OutputFormat.Mkv,
        OutputFormat.Webm,
        OutputFormat.Avi,
        OutputFormat.Mov,
      ],
      OutputFormat.Mp4,
      "Formato",
    ),
    extractAudio: (() => {
      const raw = findFlag(args, "--extract-audio");
      if (!raw) return null;
      const valid = [
        AudioFormat.Mp3,
        AudioFormat.Aac,
        AudioFormat.Opus,
        AudioFormat.Flac,
        AudioFormat.Wav,
        AudioFormat.Ogg,
      ] as const;
      if (!valid.includes(raw as AudioFormat)) {
        throw new InvalidInputError(
          "Formato de áudio",
          `deve ser um de: ${valid.join(", ")}`,
        );
      }
      return raw as AudioFormat;
    })(),
    videoCodec: parseEnum(
      args,
      "--video-codec",
      [
        VideoCodec.Copy,
        VideoCodec.H264,
        VideoCodec.H265,
        VideoCodec.Vp9,
        VideoCodec.Av1,
      ],
      VideoCodec.Copy,
      "Codec de vídeo",
    ),
    audioCodec: parseEnum(
      args,
      "--audio-codec",
      [
        AudioCodec.Copy,
        AudioCodec.Aac,
        AudioCodec.Opus,
        AudioCodec.Mp3,
        AudioCodec.Flac,
      ],
      AudioCodec.Copy,
      "Codec de áudio",
    ),
    videoBitrate: findFlag(args, "--video-bitrate"),
    audioBitrate: findFlag(args, "--audio-bitrate"),
    resolution: findFlag(args, "--resolution"),
    fps: (() => {
      const raw = findFlag(args, "--fps");
      if (!raw) return null;
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 1 || num > 120) {
        throw new InvalidInputError("FPS", "deve ser inteiro entre 1 e 120");
      }
      return num;
    })(),
    trimStart: findFlag(args, "--trim-start"),
    trimEnd: findFlag(args, "--trim-end"),
    noAudio: hasFlag(args, "--no-audio"),
    noVideo: hasFlag(args, "--no-video"),
    infoOnly: hasFlag(args, "--info-only"),
    interactive,
    hardwareAccel: parseEnum(
      args,
      "--hardware-accel",
      [
        HardwareAccel.None,
        HardwareAccel.Auto,
        HardwareAccel.Nvenc,
        HardwareAccel.Qsv,
        HardwareAccel.Vaapi,
        HardwareAccel.Videotoolbox,
      ],
      HardwareAccel.Auto,
      "Aceleração de hardware",
    ),
    threads: (() => {
      const raw = findFlag(args, "--threads");
      if (!raw) return null;
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 1 || num > 128) {
        throw new InvalidInputError("Threads", "deve ser inteiro entre 1 e 128");
      }
      return num;
    })(),
    preset: parseEnum(
      args,
      "--preset",
      [
        EncodingPreset.Ultrafast,
        EncodingPreset.Fast,
        EncodingPreset.Medium,
        EncodingPreset.Slow,
      ],
      EncodingPreset.Fast,
      "Preset",
    ),
  };
}
