import pc from "picocolors";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { formatBytes, formatEta, formatSpeed } from "../../infrastructure/helpers/format.ts";

const THROTTLE_MS = 250;
const MIN_BAR_WIDTH = 15;
const BAR_PADDING = 12;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class CliProgressRenderer implements ProgressReporter {
  private lastPrintAt = 0;
  private spinnerIdx = 0;
  private linesWritten = 0;

  phase(current: number, total: number, label: string): void {
    console.log(
      pc.cyan(`\n  [${current}/${total}]`) + ` ${label}`,
    );
  }

  info(message: string): void {
    this.clearProgress();
    console.log(pc.dim(`  ${message}`));
  }

  warn(message: string): void {
    this.clearProgress();
    console.log(pc.yellow(`  ${message}`));
  }

  start(label: string): void {
    this.lastPrintAt = 0;
    this.linesWritten = 0;
    console.log(pc.cyan(`\n  ${label}`));
  }

  update(progress: DownloadProgress): void {
    const now = Date.now();
    if (now - this.lastPrintAt < THROTTLE_MS) return;
    this.lastPrintAt = now;

    this.clearProgress();

    const pct = progress.percent;

    if (pct !== null) {
      this.renderDeterminate(progress, pct);
    } else {
      this.renderIndeterminate(progress);
    }
  }

  finish(message: string): void {
    this.clearProgress();
    console.log(pc.green(`  ${message}`));
  }

  error(message: string): void {
    this.clearProgress();
    console.log(pc.red(`  ${message}`));
  }

  private renderDeterminate(progress: DownloadProgress, pct: number): void {
    const cols = process.stdout.columns ?? 80;
    const barWidth = Math.max(MIN_BAR_WIDTH, cols - BAR_PADDING);

    const bar = this.buildBar(pct, barWidth);
    const pctStr = pc.bold(`${pct.toFixed(1)}%`);

    const parts: string[] = [];
    if (progress.totalBytes !== null && progress.totalBytes > 0) {
      parts.push(`${formatBytes(progress.downloadedBytes)} de ~${formatBytes(progress.totalBytes)}`);
    } else {
      parts.push(formatBytes(progress.downloadedBytes));
    }
    parts.push(formatSpeed(progress.speedBytesPerSecond));

    const eta = progress.etaMs;
    if (eta !== null && eta > 0) {
      parts.push(`falta ${formatEta(eta)}`);
    }

    const line1 = `  ${bar}  ${pctStr}`;
    const line2 = `  ${pc.dim(parts.join("  ·  "))}`;

    process.stdout.write(`${line1}\n${line2}`);
    this.linesWritten = 2;
  }

  private renderIndeterminate(progress: DownloadProgress): void {
    const frame = SPINNER_FRAMES[this.spinnerIdx % SPINNER_FRAMES.length]!;
    this.spinnerIdx++;

    const parts: string[] = [];
    parts.push(formatBytes(progress.downloadedBytes));
    parts.push(formatSpeed(progress.speedBytesPerSecond));

    if (progress.elapsedMs > 0) {
      const elapsed = Math.floor(progress.elapsedMs / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      parts.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }

    const line = `  ${pc.cyan(frame)} ${pc.dim(parts.join("  ·  "))}`;
    process.stdout.write(line);
    this.linesWritten = 1;
  }

  private buildBar(percent: number, width: number): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return pc.green("█".repeat(filled)) + pc.dim("░".repeat(empty));
  }

  private clearProgress(): void {
    if (this.linesWritten > 0) {
      for (let i = 0; i < this.linesWritten; i++) {
        process.stdout.write("\x1B[2K");
        if (i < this.linesWritten - 1) {
          process.stdout.write("\x1B[1A");
        }
      }
      process.stdout.write("\r");
      this.linesWritten = 0;
    }
  }
}
