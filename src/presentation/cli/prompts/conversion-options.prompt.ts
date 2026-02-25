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

type ConversionPreset = "mp3" | "mp4-optimized" | "shrink-720p" | "custom" | "none";

function onCancel(): never {
  p.cancel("Tudo bem, até a próxima!");
  process.exit(0);
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

export async function promptConversion(): Promise<ConversionTask | null> {
  const preset = cancelGuard(
    await p.select<ConversionPreset>({
      message: "Quer converter o arquivo depois de baixar?",
      options: [
        {
          value: "none",
          label: "Não, manter o original",
          hint: "mais rápido",
        },
        {
          value: "mp3",
          label: "Extrair só o áudio (MP3)",
          hint: "ideal pra músicas e podcasts",
        },
        {
          value: "mp4-optimized",
          label: "MP4 otimizado (H.264 + AAC)",
          hint: "compatível com tudo",
        },
        {
          value: "shrink-720p",
          label: "Reduzir tamanho (720p)",
          hint: "boa qualidade, arquivo menor",
        },
        {
          value: "custom",
          label: "Personalizar conversão",
          hint: "codec, bitrate, resolução, corte...",
        },
      ],
    }),
  );

  if (preset === "none") return null;

  switch (preset) {
    case "mp3":
      return createMp3Preset();
    case "mp4-optimized":
      return createMp4Preset();
    case "shrink-720p":
      return createShrinkPreset();
    case "custom":
      return promptCustomConversion();
  }
}

function createMp3Preset(): ConversionTask {
  return {
    outputFormat: OutputFormat.Mp4,
    extractAudio: AudioFormat.Mp3,
    videoCodec: VideoCodec.Copy,
    audioCodec: AudioCodec.Mp3,
    videoBitrate: null,
    audioBitrate: new Bitrate("192k"),
    resolution: null,
    fps: null,
    timeRange: new TimeRange(null, null),
    noAudio: false,
    noVideo: false,
  };
}

function createMp4Preset(): ConversionTask {
  return {
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
}

function createShrinkPreset(): ConversionTask {
  return {
    outputFormat: OutputFormat.Mp4,
    extractAudio: null,
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.Aac,
    videoBitrate: new Bitrate("2M"),
    audioBitrate: new Bitrate("128k"),
    resolution: "1280x720",
    fps: 30,
    timeRange: new TimeRange(null, null),
    noAudio: false,
    noVideo: false,
  };
}

async function promptCustomConversion(): Promise<ConversionTask> {
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
            { value: VideoCodec.Copy, label: "Copy", hint: "sem recodificação" },
            { value: VideoCodec.H264, label: "H.264" },
            { value: VideoCodec.H265, label: "H.265 / HEVC" },
            { value: VideoCodec.Vp9, label: "VP9" },
            { value: VideoCodec.Av1, label: "AV1", hint: "mais lento, melhor compressão" },
          ],
        }),
      ) as VideoCodec;

      if (videoCodec !== VideoCodec.Copy) {
        const videoBitrateRaw = cancelGuard(
          await p.text({
            message: "Bitrate do vídeo (ex: 5M, 2500K, vazio = automático):",
            defaultValue: "",
            placeholder: "automático",
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
            ],
          }),
        );
        resolution = resolutionChoice || null;

        const fpsChoice = cancelGuard(
          await p.select({
            message: "Frame rate:",
            options: [
              { value: 0, label: "Manter original" },
              { value: 60, label: "60 fps" },
              { value: 30, label: "30 fps" },
              { value: 24, label: "24 fps", hint: "cinema" },
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
          { value: AudioCodec.Copy, label: "Copy", hint: "sem recodificação" },
          { value: AudioCodec.Aac, label: "AAC" },
          { value: AudioCodec.Opus, label: "Opus" },
          { value: AudioCodec.Mp3, label: "MP3" },
          { value: AudioCodec.Flac, label: "FLAC" },
        ],
      }),
    ) as AudioCodec;

    if (audioCodec !== AudioCodec.Copy) {
      const audioBitrateRaw = cancelGuard(
        await p.text({
          message: "Bitrate do áudio (ex: 192k, 320k, vazio = automático):",
          defaultValue: "",
          placeholder: "automático",
          validate: validateBitrate,
        }),
      );
      audioBitrate = audioBitrateRaw.trim()
        ? new Bitrate(audioBitrateRaw.trim())
        : null;
    }
  }

  const wantTrim = cancelGuard(
    await p.confirm({
      message: "Quer cortar um trecho específico?",
      initialValue: false,
    }),
  );

  let trimStart: string | null = null;
  let trimEnd: string | null = null;

  if (wantTrim) {
    const trim = await p.group(
      {
        trimStart: () =>
          p.text({
            message: "Início do corte (HH:MM:SS, vazio = desde o começo):",
            defaultValue: "",
            placeholder: "00:00:00",
            validate: validateTimeCode,
          }),
        trimEnd: () =>
          p.text({
            message: "Fim do corte (HH:MM:SS, vazio = até o final):",
            defaultValue: "",
            placeholder: "até o final",
            validate: validateTimeCode,
          }),
      },
      { onCancel },
    );
    trimStart = trim.trimStart.trim() || null;
    trimEnd = trim.trimEnd.trim() || null;
  }

  return {
    outputFormat: base.outputFormat,
    extractAudio,
    videoCodec,
    audioCodec,
    videoBitrate,
    audioBitrate,
    resolution,
    fps,
    timeRange: new TimeRange(trimStart, trimEnd),
    noAudio,
    noVideo,
  };
}
