import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConversionTask } from "../../../domain/entities/conversion-task.ts";
import { AudioCodec } from "../../../domain/enums/audio-codec.ts";
import { AudioFormat } from "../../../domain/enums/audio-format.ts";
import { EncodingPreset } from "../../../domain/enums/encoding-preset.ts";
import { HardwareAccel } from "../../../domain/enums/hardware-accel.ts";
import { OutputFormat } from "../../../domain/enums/output-format.ts";
import { VideoCodec } from "../../../domain/enums/video-codec.ts";
import type { HardwareDetector } from "../../../domain/ports/hardware-detector.port.ts";
import { Bitrate } from "../../../domain/value-objects/bitrate.ts";
import { TimeRange } from "../../../domain/value-objects/time-range.ts";
import {
  validateBitrate,
  validateTimeCode,
} from "../validators/input.validators.ts";

type ConversionPreset = "mp3" | "mp4-optimized" | "shrink-720p" | "fast-480p" | "custom" | "none";

function onCancel(): never {
  p.cancel("Tudo bem, até a próxima!");
  process.exit(0);
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

export interface ConversionOptions {
  task: ConversionTask;
  hardwareAccel: HardwareAccel;
  threads: number | null;
  preset: EncodingPreset;
}

export async function promptConversion(
  hardwareDetector?: HardwareDetector,
): Promise<ConversionOptions | null> {
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
          value: "fast-480p",
          label: pc.yellow("Rápido 480p (sem áudio)"),
          hint: "máxima performance, arquivo pequeno",
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

  let task: ConversionTask;
  switch (preset) {
    case "mp3":
      task = createMp3Preset();
      break;
    case "mp4-optimized":
      task = createMp4Preset();
      break;
    case "shrink-720p":
      task = createShrinkPreset();
      break;
    case "fast-480p":
      task = createFast480pPreset();
      break;
    case "custom":
      task = await promptCustomConversion();
      break;
    default:
      return null;
  }

  const perf = await promptPerformanceOptions(hardwareDetector);

  return {
    task: { ...task, ...perf },
    hardwareAccel: perf.hardwareAccel,
    threads: perf.threads,
    preset: perf.preset,
  };
}

async function promptPerformanceOptions(
  hardwareDetector?: HardwareDetector,
): Promise<{ hardwareAccel: HardwareAccel; threads: number | null; preset: EncodingPreset }> {
  const cpuThreads = hardwareDetector?.getCpuThreads() ?? navigator.hardwareConcurrency ?? 4;

  if (!hardwareDetector) {
    return {
      hardwareAccel: HardwareAccel.None,
      threads: cpuThreads,
      preset: EncodingPreset.Medium,
    };
  }

  const spinner = p.spinner();
  spinner.start("Detectando hardware disponível...");

  const availableAccel = await hardwareDetector.detectAvailableAccel();
  const optimalAccel = await hardwareDetector.getOptimalAccel();

  spinner.stop("Detecção concluída");

  const hasGpu = availableAccel.some(
    (a) => a !== HardwareAccel.None && a !== HardwareAccel.Auto,
  );

  const gpuLabel = hasGpu
    ? ` (${availableAccel.filter((a) => a !== HardwareAccel.None && a !== HardwareAccel.Auto).join(", ").toUpperCase()})`
    : "";

  const perfMode = cancelGuard(
    await p.select({
      message: "Performance de conversão:",
      options: [
        {
          value: "auto",
          label: pc.green("Automática (máximo disponível)"),
          hint: `GPU${gpuLabel || " não detectada"}, ${cpuThreads} threads CPU`,
        },
        {
          value: "gpu",
          label: "Usar GPU" + gpuLabel,
          hint: hasGpu ? "aceleração por hardware" : "não disponível",
        },
        {
          value: "cpu",
          label: `Usar CPU (${cpuThreads} threads)`,
          hint: "codificação por software",
        },
        {
          value: "custom",
          label: "Personalizar",
          hint: "ajustar threads, preset manualmente",
        },
      ],
    }),
  );

  if (perfMode === "auto") {
    return {
      hardwareAccel: optimalAccel,
      threads: cpuThreads,
      preset: hasGpu ? EncodingPreset.Fast : EncodingPreset.Medium,
    };
  }

  if (perfMode === "gpu") {
    return {
      hardwareAccel: optimalAccel !== HardwareAccel.None ? optimalAccel : HardwareAccel.None,
      threads: cpuThreads,
      preset: EncodingPreset.Fast,
    };
  }

  if (perfMode === "cpu") {
    return {
      hardwareAccel: HardwareAccel.None,
      threads: cpuThreads,
      preset: EncodingPreset.Medium,
    };
  }

  return promptCustomPerformance(availableAccel, cpuThreads);
}

async function promptCustomPerformance(
  availableAccel: HardwareAccel[],
  cpuThreads: number,
): Promise<{ hardwareAccel: HardwareAccel; threads: number | null; preset: EncodingPreset }> {
  const custom = await p.group(
    {
      hardwareAccel: () =>
        p.select({
          message: "Aceleração de hardware:",
          options: availableAccel.map((a) => ({
            value: a,
            label: a === HardwareAccel.None ? "Nenhuma (CPU apenas)" : a.toUpperCase(),
          })),
        }),
      threads: () =>
        p.text({
          message: "Número de threads (vazio = automático):",
          defaultValue: String(cpuThreads),
          placeholder: String(cpuThreads),
          validate: (v) => {
            if (!v.trim()) return undefined;
            const n = Number(v.trim());
            if (!Number.isInteger(n) || n < 1 || n > 128) {
              return "Deve ser inteiro entre 1 e 128";
            }
            return undefined;
          },
        }),
      preset: () =>
        p.select({
          message: "Preset de velocidade:",
          options: [
            { value: EncodingPreset.Ultrafast, label: "Ultrafast", hint: "mais rápido, arquivo maior" },
            { value: EncodingPreset.Fast, label: "Fast", hint: "rápido, boa qualidade" },
            { value: EncodingPreset.Medium, label: "Medium", hint: "equilibrado" },
            { value: EncodingPreset.Slow, label: "Slow", hint: "mais lento, melhor compressão" },
          ],
        }),
    },
    { onCancel },
  );

  return {
    hardwareAccel: custom.hardwareAccel as HardwareAccel,
    threads: custom.threads.trim() ? Number(custom.threads.trim()) : null,
    preset: custom.preset as EncodingPreset,
  };
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
    hardwareAccel: HardwareAccel.None,
    threads: null,
    preset: EncodingPreset.Medium,
    crf: null,
  };
}

function createMp4Preset(): ConversionTask {
  return {
    outputFormat: OutputFormat.Mp4,
    extractAudio: null,
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.Aac,
    videoBitrate: null,
    audioBitrate: new Bitrate("192k"),
    resolution: null,
    fps: null,
    timeRange: new TimeRange(null, null),
    noAudio: false,
    noVideo: false,
    hardwareAccel: HardwareAccel.Auto,
    threads: null,
    preset: EncodingPreset.Fast,
    crf: 23,
  };
}

function createShrinkPreset(): ConversionTask {
  return {
    outputFormat: OutputFormat.Mp4,
    extractAudio: null,
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.Aac,
    videoBitrate: null,
    audioBitrate: new Bitrate("128k"),
    resolution: "1280x720",
    fps: 30,
    timeRange: new TimeRange(null, null),
    noAudio: false,
    noVideo: false,
    hardwareAccel: HardwareAccel.Auto,
    threads: null,
    preset: EncodingPreset.Fast,
    crf: 28,
  };
}

function createFast480pPreset(): ConversionTask {
  return {
    outputFormat: OutputFormat.Mp4,
    extractAudio: null,
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.Copy,
    videoBitrate: null,
    audioBitrate: null,
    resolution: "854x480",
    fps: 30,
    timeRange: new TimeRange(null, null),
    noAudio: true, // Remove áudio para máxima velocidade
    noVideo: false,
    hardwareAccel: HardwareAccel.Auto, // Usa GPU automaticamente se disponível
    threads: null,
    preset: EncodingPreset.Ultrafast, // Preset mais rápido
    crf: 30, // CRF mais alto = mais compressão, menor arquivo
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
  let crf: number | null = null;
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
        const qualityMode = cancelGuard(
          await p.select({
            message: "Controle de qualidade do vídeo:",
            options: [
              { value: "crf", label: "CRF (qualidade constante)", hint: "recomendado — arquivo menor" },
              { value: "bitrate", label: "Bitrate fixo", hint: "tamanho previsível" },
              { value: "auto", label: "Automático", hint: "ffmpeg decide" },
            ],
          }),
        );

        if (qualityMode === "crf") {
          const crfRaw = cancelGuard(
            await p.text({
              message: "CRF (0-51, padrão 23 — menor = mais qualidade, maior arquivo menor):",
              defaultValue: "23",
              placeholder: "23",
              validate: (v) => {
                if (!v.trim()) return undefined;
                const n = Number(v.trim());
                if (!Number.isInteger(n) || n < 0 || n > 51) {
                  return "Deve ser inteiro entre 0 e 51";
                }
                return undefined;
              },
            }),
          );
          crf = crfRaw.trim() ? Number(crfRaw.trim()) : 23;
        } else if (qualityMode === "bitrate") {
          const videoBitrateRaw = cancelGuard(
            await p.text({
              message: "Bitrate do vídeo (ex: 5M, 2500K):",
              defaultValue: "",
              placeholder: "5M",
              validate: validateBitrate,
            }),
          );
          videoBitrate = videoBitrateRaw.trim()
            ? new Bitrate(videoBitrateRaw.trim())
            : null;
        }

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
    hardwareAccel: HardwareAccel.Auto,
    threads: null,
    preset: EncodingPreset.Medium,
    crf,
  };
}

export function buildConversionTask(options: {
  outputFormat: OutputFormat;
  extractAudio: AudioFormat | null;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  videoBitrate: Bitrate | null;
  audioBitrate: Bitrate | null;
  resolution: string | null;
  fps: number | null;
  timeRange: TimeRange;
  noAudio: boolean;
  noVideo: boolean;
  hardwareAccel?: HardwareAccel;
  threads?: number | null;
  preset?: EncodingPreset;
  crf?: number | null;
}): ConversionTask {
  return {
    outputFormat: options.outputFormat,
    extractAudio: options.extractAudio,
    videoCodec: options.videoCodec,
    audioCodec: options.audioCodec,
    videoBitrate: options.videoBitrate,
    audioBitrate: options.audioBitrate,
    resolution: options.resolution,
    fps: options.fps,
    timeRange: options.timeRange,
    noAudio: options.noAudio,
    noVideo: options.noVideo,
    hardwareAccel: options.hardwareAccel ?? HardwareAccel.Auto,
    threads: options.threads ?? null,
    preset: options.preset ?? EncodingPreset.Medium,
    crf: options.crf ?? null,
  };
}
