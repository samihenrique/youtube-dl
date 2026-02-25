import * as p from "@clack/prompts";
import type { VideoInfo } from "../../../domain/entities/video-info.ts";
import { DownloadMode } from "../../../domain/enums/download-mode.ts";
import { VideoType } from "../../../domain/enums/video-type.ts";
import type { QualityOption } from "../../../domain/value-objects/quality-option.ts";
import { getSmartDefaults } from "../defaults.ts";
import {
  validateInteger,
  validateBitrate,
  validatePositiveInteger,
} from "../validators/input.validators.ts";

export type ActionChoice = "download" | "quality" | "customize" | "info";

function onCancel(): never {
  p.cancel("Tudo bem, até a próxima!");
  process.exit(0);
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

export async function promptAction(videoInfo: VideoInfo): Promise<ActionChoice> {
  const isLive =
    videoInfo.type === VideoType.Live ||
    videoInfo.type === VideoType.PostLiveDvr;

  const downloadLabel = isLive
    ? "Baixar agora (melhor qualidade, DVR completo)"
    : "Baixar agora (melhor qualidade)";

  const result = cancelGuard(
    await p.select<ActionChoice>({
      message: "O que deseja fazer?",
      options: [
        {
          value: "download",
          label: downloadLabel,
          hint: "forma mais rápida",
        },
        {
          value: "quality",
          label: "Escolher a qualidade",
        },
        {
          value: "customize",
          label: "Personalizar tudo",
          hint: "qualidade, destino, opções avançadas",
        },
        {
          value: "info",
          label: "Só quero ver as informações",
        },
      ],
    }),
  );

  return result;
}

export async function promptQuality(
  qualities: readonly QualityOption[],
): Promise<string> {
  const qualityChoices =
    qualities.length > 0
      ? qualities.map((q) => ({ value: q.label, label: q.label }))
      : [{ value: "best", label: "Melhor disponível" }];

  return cancelGuard(
    await p.select({
      message: "Qual qualidade?",
      options: [
        ...qualityChoices,
        { value: "audio-only", label: "Somente áudio" },
      ],
    }),
  );
}

export async function promptLiveMode(): Promise<DownloadMode> {
  return cancelGuard(
    await p.select({
      message: "Como quer baixar a live?",
      options: [
        {
          value: DownloadMode.DvrStart,
          label: "Do início (DVR)",
          hint: "baixa toda a janela disponível",
        },
        {
          value: DownloadMode.LiveNow,
          label: "A partir de agora",
          hint: "grava em tempo real",
        },
      ],
    }),
  ) as DownloadMode;
}

export interface CustomizeResult {
  quality: string;
  liveMode: DownloadMode;
  outputDir: string;
  concurrency: number;
  rateLimit: string | null;
  maxDuration: number | null;
  retries: number;
  timeout: number;
}

export async function promptCustomize(
  videoInfo: VideoInfo,
): Promise<CustomizeResult> {
  const defaults = getSmartDefaults(videoInfo);
  const isLive =
    videoInfo.type === VideoType.Live ||
    videoInfo.type === VideoType.PostLiveDvr;

  const quality = await promptQuality(videoInfo.qualities);

  let liveMode: DownloadMode = DownloadMode.DvrStart;
  if (isLive) {
    liveMode = await promptLiveMode();
  }

  const outputDir = cancelGuard(
    await p.text({
      message: "Onde salvar?",
      initialValue: defaults.outputDir,
      validate: (v) => {
        if (!v.trim()) return "Precisa informar o diretório";
        return undefined;
      },
    }),
  );

  const wantAdvanced = cancelGuard(
    await p.confirm({
      message: "Ajustar opções avançadas? (downloads paralelos, limites, etc.)",
      initialValue: false,
    }),
  );

  if (!wantAdvanced) {
    return {
      quality,
      liveMode,
      outputDir,
      concurrency: defaults.concurrency,
      rateLimit: null,
      maxDuration: null,
      retries: defaults.retries,
      timeout: defaults.timeout,
    };
  }

  const advanced = await p.group(
    {
      concurrency: () =>
        p.text({
          message: "Downloads paralelos (1-64):",
          defaultValue: String(defaults.concurrency),
          placeholder: String(defaults.concurrency),
          validate: (v) => validateInteger(v, 1, 64, "Downloads paralelos"),
        }),
      rateLimit: () =>
        p.text({
          message: "Limitar velocidade? (ex: 10M, 500K, vazio = sem limite)",
          defaultValue: "",
          placeholder: "sem limite",
          validate: validateBitrate,
        }),
      maxDuration: () =>
        p.text({
          message: "Duração máxima em segundos? (vazio = sem limite)",
          defaultValue: "",
          placeholder: "sem limite",
          validate: (v) => validatePositiveInteger(v, "Duração máxima"),
        }),
      retries: () =>
        p.text({
          message: "Tentativas por segmento (0-20):",
          defaultValue: String(defaults.retries),
          placeholder: String(defaults.retries),
          validate: (v) => validateInteger(v, 0, 20, "Tentativas"),
        }),
      timeout: () =>
        p.text({
          message: "Timeout por requisição em segundos (5-300):",
          defaultValue: String(defaults.timeout),
          placeholder: String(defaults.timeout),
          validate: (v) => validateInteger(v, 5, 300, "Timeout"),
        }),
    },
    { onCancel },
  );

  return {
    quality,
    liveMode,
    outputDir,
    concurrency: Number(advanced.concurrency),
    rateLimit: advanced.rateLimit.trim() || null,
    maxDuration: advanced.maxDuration.trim()
      ? Number(advanced.maxDuration.trim())
      : null,
    retries: Number(advanced.retries),
    timeout: Number(advanced.timeout),
  };
}
