import pc from "picocolors";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { formatBytes, formatDuration, formatSpeed } from "../../infrastructure/helpers/format.ts";

const BAR_WIDTH = 30;
const THROTTLE_MS = 500;

export class CliProgressRenderer implements ProgressReporter {
  private lastPrintAt = 0;

  start(label: string): void {
    this.lastPrintAt = 0;
    console.log(pc.cyan(`\n▶ ${label}`));
  }

  update(progress: DownloadProgress): void {
    const now = Date.now();
    if (now - this.lastPrintAt < THROTTLE_MS) return;
    this.lastPrintAt = now;

    const parts: string[] = [];

    const pct = progress.percent;
    if (pct !== null) {
      parts.push(this.buildBar(pct));
      parts.push(pc.bold(`${pct.toFixed(1)}%`));
    }

    parts.push(pc.dim(`${formatBytes(progress.downloadedBytes)}`));
    parts.push(pc.dim(formatSpeed(progress.speedBytesPerSecond)));

    if (progress.downloadedSegments > 0 && progress.totalSegments !== null) {
      parts.push(
        pc.dim(`seg: ${progress.downloadedSegments}/${progress.totalSegments}`),
      );
    }

    const eta = progress.etaMs;
    if (eta !== null) {
      parts.push(pc.yellow(`ETA: ${formatDuration(eta / 1000)}`));
    }

    process.stdout.write(`\r  ${parts.join(pc.dim(" │ "))}  `);
  }

  finish(message: string): void {
    process.stdout.write("\r" + " ".repeat(120) + "\r");
    console.log(pc.green(`✔ ${message}`));
  }

  error(message: string): void {
    process.stdout.write("\r" + " ".repeat(120) + "\r");
    console.log(pc.red(`✖ ${message}`));
  }

  private buildBar(percent: number): string {
    const filled = Math.round((percent / 100) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    return (
      pc.green("█".repeat(filled)) + pc.dim("░".repeat(empty))
    );
  }
}
