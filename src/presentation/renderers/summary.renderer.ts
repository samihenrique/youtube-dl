import pc from "picocolors";
import type { VideoInfo } from "../../domain/entities/video-info.ts";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { formatDuration } from "../../infrastructure/helpers/format.ts";

interface SummaryOptions {
  videoInfo: VideoInfo;
  quality: string;
  outputDir: string;
  liveMode: DownloadMode;
  conversion: ConversionTask | null;
  concurrency: number;
}

export function renderVideoCard(info: VideoInfo): void {
  const typeLabel =
    info.type === VideoType.Live
      ? pc.red(" AO VIVO ")
      : info.type === VideoType.PostLiveDvr
        ? pc.yellow(" DVR ")
        : pc.green(" VIDEO ");

  const duration = info.durationSeconds
    ? pc.dim(` · ${formatDuration(info.durationSeconds)}`)
    : "";

  const qualities =
    info.qualities.length > 0
      ? pc.dim(` · ${info.qualities.map((q) => q.label).join(", ")}`)
      : "";

  console.log();
  console.log(`  ${typeLabel} ${pc.bold(info.title)}${duration}`);
  if (qualities) {
    console.log(`  ${pc.dim("Qualidades disponíveis:")}${qualities}`);
  }
  console.log();
}

export function renderVideoDetails(info: VideoInfo): void {
  const line = pc.dim("─".repeat(Math.min(50, process.stdout.columns ?? 50)));
  console.log();
  console.log(`  ${line}`);
  console.log(`  ${pc.dim("ID")}          ${info.id}`);
  console.log(`  ${pc.dim("Título")}      ${info.title}`);
  console.log(`  ${pc.dim("Tipo")}        ${formatType(info.type)}`);
  if (info.durationSeconds) {
    console.log(
      `  ${pc.dim("Duração")}     ${formatDuration(info.durationSeconds)}`,
    );
  }
  if (info.qualities.length > 0) {
    console.log(
      `  ${pc.dim("Qualidades")}  ${info.qualities.map((q) => q.label).join(", ")}`,
    );
  }
  if (info.dashFormats.length > 0) {
    console.log(`  ${pc.dim("Formatos")}    ${info.dashFormats.length} streams DASH disponíveis`);
  }
  console.log(`  ${line}`);
  console.log();
}

export function renderDownloadSummary(opts: SummaryOptions): void {
  const cols = Math.min(55, (process.stdout.columns ?? 60) - 4);
  const top = `  ${pc.dim("┌" + "─".repeat(cols) + "┐")}`;
  const bot = `  ${pc.dim("└" + "─".repeat(cols) + "┘")}`;
  const sep = `  ${pc.dim("│")}`;

  const isLive =
    opts.videoInfo.type === VideoType.Live ||
    opts.videoInfo.type === VideoType.PostLiveDvr;

  const title = truncate(opts.videoInfo.title, cols - 4);

  const lines: string[] = [];
  lines.push(`${formatTypeIcon(opts.videoInfo.type)} ${pc.bold(title)}`);
  lines.push("");

  const details: [string, string][] = [];
  details.push(["Qualidade", opts.quality === "best" ? "Melhor disponível" : opts.quality]);
  details.push(["Destino", opts.outputDir]);

  if (isLive) {
    details.push([
      "Modo",
      opts.liveMode === DownloadMode.DvrStart
        ? "Do início (DVR)"
        : "Ao vivo (tempo real)",
    ]);
  }

  if (opts.conversion) {
    if (opts.conversion.extractAudio) {
      details.push(["Conversão", `Extrair áudio (${opts.conversion.extractAudio.toUpperCase()})`]);
    } else {
      details.push(["Conversão", `${opts.conversion.outputFormat.toUpperCase()}`]);
    }
  }

  details.push(["Concorrência", `${opts.concurrency} downloads paralelos`]);

  for (const [label, value] of details) {
    lines.push(`${pc.dim(label.padEnd(12))} ${value}`);
  }

  console.log();
  console.log(top);
  for (const line of lines) {
    console.log(`${sep}  ${line}`);
  }
  console.log(bot);
  console.log();
}

function formatType(type: string): string {
  switch (type) {
    case VideoType.Live:
      return pc.red("Ao vivo");
    case VideoType.PostLiveDvr:
      return pc.yellow("DVR (pós-live)");
    default:
      return pc.green("Vídeo");
  }
}

function formatTypeIcon(type: string): string {
  switch (type) {
    case VideoType.Live:
      return pc.red("●");
    case VideoType.PostLiveDvr:
      return pc.yellow("◉");
    default:
      return pc.green("▶");
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
