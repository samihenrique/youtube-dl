import * as p from "@clack/prompts";
import type { ConversionTask } from "../../../domain/entities/conversion-task.ts";
import { AudioCodec } from "../../../domain/enums/audio-codec.ts";
import { AudioFormat } from "../../../domain/enums/audio-format.ts";
import { OutputFormat } from "../../../domain/enums/output-format.ts";
import { VideoCodec } from "../../../domain/enums/video-codec.ts";
import { Bitrate } from "../../../domain/value-objects/bitrate.ts";
import { TimeRange } from "../../../domain/value-objects/time-range.ts";
import {
  validateBitrate,
  validateTimeCode,
} from "../validators/input.validators.ts";

function onCancel() {
  p.cancel("Operação cancelada.");
  process.exit(0);
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

export async function promptShouldConvert(): Promise<boolean> {
  return cancelGuard(
    await p.confirm({
      message: "Converter o vídeo após o download?",
      initialValue: false,
    }),
  );
}

export async function promptConversionOptions(): Promise<ConversionTask> {
  const base = await p.group(
    {
      outputFormat: () =>
        p.select({
          message: "Formato de saída:",
          options: [
            { value: OutputFormat.Mp4, label: "MP4" },
            { value: OutputFormat.Mkv, label: "MKV" },
            { value: OutputFormat.Webm, label: "WebM" },
            { value: OutputFormat.Avi, label: "AVI" },
            { value: OutputFormat.Mov, label: "MOV" },
          ],
        }),
      extractAudio: () =>
        p.select({
          message: "Extrair somente áudio?",
          options: [
            { value: "no" as const, label: "Não, manter vídeo" },
            { value: AudioFormat.Mp3, label: "MP3" },
            { value: AudioFormat.Aac, label: "AAC" },
            { value: AudioFormat.Opus, label: "Opus" },
            { value: AudioFormat.Flac, label: "FLAC" },
            { value: AudioFormat.Wav, label: "WAV" },
            { value: AudioFormat.Ogg, label: "OGG" },
          ],
        }),
    },
    { onCancel },
  );

  const extractAudio =
    base.extractAudio === "no" ? null : (base.extractAudio as AudioFormat);

  let videoCodec: VideoCodec = VideoCodec.Copy;
  let videoBitrate: Bitrate | null = null;
  let resolution: string | null = null;
  let fps: number | null = null;
  let noVideo = false;

  if (!extractAudio) {
    noVideo = cancelGuard(
      await p.confirm({
        message: "Remover faixa de vídeo?",
        initialValue: false,
      }),
    );

    if (!noVideo) {
      videoCodec = cancelGuard(
        await p.select({
          message: "Codec de vídeo:",
          options: [
            {
              value: VideoCodec.Copy,
              label: "Copy",
              hint: "sem recodificação",
            },
            { value: VideoCodec.H264, label: "H.264" },
            { value: VideoCodec.H265, label: "H.265 / HEVC" },
            { value: VideoCodec.Vp9, label: "VP9" },
            {
              value: VideoCodec.Av1,
              label: "AV1",
              hint: "mais lento, melhor compressão",
            },
          ],
        }),
      ) as VideoCodec;

      if (videoCodec !== VideoCodec.Copy) {
        const videoBitrateRaw = cancelGuard(
          await p.text({
            message: 'Bitrate do vídeo (ex: "5M", "2500K", vazio = auto):',
            defaultValue: "",
            placeholder: "auto",
            validate: validateBitrate,
          }),
        );
        videoBitrate = videoBitrateRaw.trim()
          ? new Bitrate(videoBitrateRaw.trim())
          : null;

        const resolutionChoice = cancelGuard(
          await p.select({
            message: "Resolução:",
            options: [
              { value: "", label: "Manter original" },
              { value: "3840x2160", label: "4K (3840x2160)" },
              { value: "2560x1440", label: "2K / QHD (2560x1440)" },
              { value: "1920x1080", label: "Full HD (1920x1080)" },
              { value: "1280x720", label: "HD (1280x720)" },
              { value: "854x480", label: "480p (854x480)" },
              { value: "640x360", label: "360p (640x360)" },
              { value: "426x240", label: "240p (426x240)" },
            ],
          }),
        );
        resolution = resolutionChoice || null;

        const fpsChoice = cancelGuard(
          await p.select({
            message: "Frame rate (FPS):",
            options: [
              { value: 0, label: "Manter original" },
              { value: 60, label: "60 fps" },
              { value: 30, label: "30 fps" },
              { value: 24, label: "24 fps", hint: "cinema" },
              { value: 15, label: "15 fps", hint: "reduz tamanho" },
            ],
          }),
        );
        fps = fpsChoice || null;
      }
    }
  }

  let audioCodec: AudioCodec = AudioCodec.Copy;
  let audioBitrate: Bitrate | null = null;
  let noAudio = false;

  if (!extractAudio && !noVideo) {
    noAudio = cancelGuard(
      await p.confirm({
        message: "Remover faixa de áudio?",
        initialValue: false,
      }),
    );
  }

  if (!noAudio) {
    audioCodec = cancelGuard(
      await p.select({
        message: "Codec de áudio:",
        options: [
          {
            value: AudioCodec.Copy,
            label: "Copy",
            hint: "sem recodificação",
          },
          { value: AudioCodec.Aac, label: "AAC" },
          { value: AudioCodec.Opus, label: "Opus" },
          { value: AudioCodec.Mp3, label: "MP3" },
          { value: AudioCodec.Flac, label: "FLAC" },
        ],
      }),
    ) as AudioCodec;

    if (audioCodec !== AudioCodec.Copy) {
      const audioSettings = await p.group(
        {
          audioBitrate: () =>
            p.text({
              message:
                'Bitrate do áudio (ex: "192k", "320k", vazio = auto):',
              defaultValue: "",
              placeholder: "auto",
              validate: validateBitrate,
            }),
        },
        { onCancel },
      );

      audioBitrate = audioSettings.audioBitrate.trim()
        ? new Bitrate(audioSettings.audioBitrate.trim())
        : null;
    }
  }

  const trim = await p.group(
    {
      trimStart: () =>
        p.text({
          message: "Trim início (HH:MM:SS, vazio = sem corte):",
          defaultValue: "",
          placeholder: "00:00:00",
          validate: validateTimeCode,
        }),
      trimEnd: () =>
        p.text({
          message: "Trim fim (HH:MM:SS, vazio = sem corte):",
          defaultValue: "",
          placeholder: "sem limite",
          validate: validateTimeCode,
        }),
    },
    { onCancel },
  );

  const timeRange = new TimeRange(
    trim.trimStart.trim() || null,
    trim.trimEnd.trim() || null,
  );

  return {
    outputFormat: base.outputFormat,
    extractAudio,
    videoCodec,
    audioCodec,
    videoBitrate,
    audioBitrate,
    resolution,
    fps,
    timeRange,
    noAudio,
    noVideo,
  };
}
