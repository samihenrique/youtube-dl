import * as p from "@clack/prompts";
import { DownloadMode } from "../../../domain/enums/download-mode.ts";
import type { VideoType } from "../../../domain/enums/video-type.ts";
import type { QualityOption } from "../../../domain/value-objects/quality-option.ts";
import {
  validateInteger,
  validateBitrate,
  validatePositiveInteger,
} from "../validators/input.validators.ts";

export interface DownloadOptions {
  quality: string;
  liveMode: DownloadMode;
  concurrency: number;
  rateLimit: string | null;
  maxDuration: number | null;
  retries: number;
  timeout: number;
}

const DEFAULTS: Omit<DownloadOptions, "quality" | "liveMode"> = {
  concurrency: 8,
  rateLimit: null,
  maxDuration: null,
  retries: 3,
  timeout: 30,
};

function onCancel() {
  p.cancel("Operação cancelada.");
  process.exit(0);
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

export async function promptDownloadOptions(
  videoType: VideoType,
  qualities: readonly QualityOption[],
): Promise<DownloadOptions> {
  const qualityChoices =
    qualities.length > 0
      ? qualities.map((q) => ({ value: q.label, label: q.label }))
      : [{ value: "best", label: "Melhor disponível" }];

  const quality = cancelGuard(
    await p.select({
      message: "Qualidade do vídeo:",
      options: [
        ...qualityChoices,
        { value: "audio-only", label: "Somente áudio" },
      ],
    }),
  );

  let liveMode: DownloadMode = DownloadMode.DvrStart;
  if (videoType === "live" || videoType === "post-live-dvr") {
    liveMode = cancelGuard(
      await p.select({
        message: "Modo de download da live:",
        options: [
          {
            value: DownloadMode.DvrStart,
            label: "Do início (DVR)",
            hint: "baixa toda a janela disponível",
          },
          {
            value: DownloadMode.LiveNow,
            label: "A partir de agora",
            hint: "grava a partir do ponto atual",
          },
        ],
      }),
    ) as DownloadMode;
  }

  const customize = cancelGuard(
    await p.confirm({
      message: "Personalizar opções de download?",
      initialValue: false,
    }),
  );

  if (!customize) {
    return { quality, liveMode, ...DEFAULTS };
  }

  const advanced = await p.group(
    {
      concurrency: () =>
        p.text({
          message: "Downloads paralelos (1-64):",
          defaultValue: "8",
          placeholder: "8",
          validate: (v) => validateInteger(v, 1, 64, "Concorrência"),
        }),
      rateLimit: () =>
        p.text({
          message:
            'Limite de velocidade (ex: "10M", "500K", vazio = sem limite):',
          defaultValue: "",
          placeholder: "sem limite",
          validate: validateBitrate,
        }),
      maxDuration: () =>
        p.text({
          message: "Duração máxima em segundos (vazio = sem limite):",
          defaultValue: "",
          placeholder: "sem limite",
          validate: (v) => validatePositiveInteger(v, "Duração máxima"),
        }),
      retries: () =>
        p.text({
          message: "Retentativas por segmento (0-20):",
          defaultValue: "3",
          placeholder: "3",
          validate: (v) => validateInteger(v, 0, 20, "Retentativas"),
        }),
      timeout: () =>
        p.text({
          message: "Timeout por requisição em segundos (5-300):",
          defaultValue: "30",
          placeholder: "30",
          validate: (v) => validateInteger(v, 5, 300, "Timeout"),
        }),
    },
    { onCancel },
  );

  return {
    quality,
    liveMode,
    concurrency: Number(advanced.concurrency),
    rateLimit: advanced.rateLimit.trim() || null,
    maxDuration: advanced.maxDuration.trim()
      ? Number(advanced.maxDuration.trim())
      : null,
    retries: Number(advanced.retries),
    timeout: Number(advanced.timeout),
  };
}
