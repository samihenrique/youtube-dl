import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v"];

function onCancel(): never {
  p.cancel("Tudo bem, até a próxima!");
  process.exit(0);
}

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) onCancel();
  return value as T;
}

export interface ConvertFilesSelection {
  inputDir: string;
  files: string[];
}

async function listVideoFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .filter((e) => VIDEO_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function promptConvertFiles(): Promise<ConvertFilesSelection | null> {
  let inputDir = cancelGuard(
    await p.text({
      message: "Diretório com os vídeos:",
      defaultValue: "./downloads",
      placeholder: "./downloads",
    }),
  );

  inputDir = inputDir.trim();
  if (!inputDir) {
    p.log.error("Precisa informar o diretório");
    return null;
  }

  try {
    const stat = await fs.stat(inputDir);
    if (!stat.isDirectory()) {
      p.log.error("Não é um diretório válido");
      return null;
    }
  } catch {
    p.log.error("Diretório não encontrado");
    return null;
  }

  const spinner = p.spinner();
  spinner.start("Escaneando arquivos...");

  const files = await listVideoFiles(inputDir);

  if (files.length === 0) {
    spinner.stop("Nenhum arquivo de vídeo encontrado");
    return null;
  }

  spinner.stop(`${files.length} arquivo(s) encontrado(s)`);

  p.note("Use ESPAÇO para selecionar/desselecionar arquivos, ENTER para confirmar");

  const selectedFiles = cancelGuard(
    await p.multiselect({
      message: "Selecione os arquivos para converter:",
      options: files.map((f) => ({ value: f, label: f })),
      required: true,
    }),
  ) as string[];

  return { inputDir, files: selectedFiles };
}

export async function promptPerformanceOptions(
  detectAvailableAccel: () => Promise<string[]>,
  getCpuThreads: () => number,
): Promise<{ hardwareAccel: string; threads: number | null; preset: string }> {
  const spinner = p.spinner();
  spinner.start("Detectando hardware disponível...");

  const availableAccel = await detectAvailableAccel();
  const cpuThreads = getCpuThreads();

  spinner.stop("Detecção concluída");

  const hasGpu = availableAccel.some(
    (a) => a !== "none" && a !== "auto",
  );

  const gpuLabel = hasGpu
    ? ` (${availableAccel.filter((a) => a !== "none" && a !== "auto").join(", ").toUpperCase()})`
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
    const optimalAccel = hasGpu
      ? availableAccel.find((a) => a !== "none" && a !== "auto") ?? "none"
      : "none";
    return {
      hardwareAccel: optimalAccel,
      threads: cpuThreads,
      preset: hasGpu ? "fast" : "medium",
    };
  }

  if (perfMode === "gpu") {
    const gpuAccel = availableAccel.find((a) => a !== "none" && a !== "auto") ?? "none";
    return {
      hardwareAccel: gpuAccel,
      threads: cpuThreads,
      preset: "fast",
    };
  }

  if (perfMode === "cpu") {
    return {
      hardwareAccel: "none",
      threads: cpuThreads,
      preset: "medium",
    };
  }

  return promptCustomPerformance(availableAccel, cpuThreads);
}

async function promptCustomPerformance(
  availableAccel: string[],
  cpuThreads: number,
): Promise<{ hardwareAccel: string; threads: number | null; preset: string }> {
  const custom = await p.group(
    {
      hardwareAccel: () =>
        p.select({
          message: "Aceleração de hardware:",
          options: availableAccel.map((a) => ({
            value: a,
            label: a === "none" ? "Nenhuma (CPU apenas)" : a.toUpperCase(),
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
            { value: "ultrafast", label: "Ultrafast", hint: "mais rápido, arquivo maior" },
            { value: "fast", label: "Fast", hint: "rápido, boa qualidade" },
            { value: "medium", label: "Medium", hint: "equilibrado" },
            { value: "slow", label: "Slow", hint: "mais lento, melhor compressão" },
          ],
        }),
    },
    { onCancel },
  );

  return {
    hardwareAccel: custom.hardwareAccel as string,
    threads: custom.threads.trim() ? Number(custom.threads.trim()) : null,
    preset: custom.preset as string,
  };
}
