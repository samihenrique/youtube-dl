import pc from "picocolors";
import type { ConversionProgress } from "../../domain/value-objects/conversion-progress.ts";
import { getProgressPercent } from "../../domain/value-objects/conversion-progress.ts";
import type { HardwareUsage } from "../../domain/value-objects/hardware-usage.ts";
import type { InputMediaInfo } from "../../domain/ports/media-converter.port.ts";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { HardwareAccel } from "../../domain/enums/hardware-accel.ts";
import { VideoCodec } from "../../domain/enums/video-codec.ts";
import {
  formatFileSizeShort,
  formatTimeFromUs,
  formatSpeedMultiplier,
  formatPercent,
  formatMemoryMb,
  formatEtaFromProgress,
} from "../../infrastructure/helpers/format-conversion.ts";

const THROTTLE_MS = 200;
const MIN_BAR_WIDTH = 20;

export interface ConversionDisplayInfo {
  filename: string;
  inputSizeBytes: number | null;
  inputInfo: InputMediaInfo | null;
  task: ConversionTask;
}

export class ConversionProgressRenderer {
  private lastPrintAt = 0;
  private linesWritten = 0;

  renderHeader(display: ConversionDisplayInfo): void {
    const { filename, inputSizeBytes, inputInfo, task } = display;

    // Line 1: filename
    console.log(`  ${pc.bold(filename)}`);

    // Line 2: input info → output info
    const inputParts: string[] = [];
    if (inputInfo?.width && inputInfo.height) {
      inputParts.push(`${inputInfo.width}x${inputInfo.height}`);
    }
    if (inputInfo?.videoCodec) {
      inputParts.push(inputInfo.videoCodec.toUpperCase());
    }
    if (inputInfo?.durationUs) {
      inputParts.push(formatTimeFromUs(inputInfo.durationUs));
    }
    if (inputSizeBytes) {
      inputParts.push(formatFileSizeShort(inputSizeBytes));
    }

    const outputParts: string[] = [];
    outputParts.push((task.extractAudio ?? task.outputFormat).toUpperCase());
    if (!task.extractAudio && task.videoCodec !== VideoCodec.Copy) {
      outputParts.push(task.videoCodec.toUpperCase());
    }
    if (task.crf !== null) {
      outputParts.push(`CRF ${task.crf}`);
    } else if (task.videoBitrate) {
      outputParts.push(task.videoBitrate.toFfmpegArg());
    }
    if (task.hardwareAccel !== HardwareAccel.None) {
      outputParts.push(`GPU (${task.hardwareAccel.toUpperCase()})`);
    }

    const inStr = inputParts.length > 0 ? inputParts.join(" · ") : "";
    const outStr = outputParts.join(" · ");
    if (inStr) {
      console.log(`  ${pc.dim(inStr)} ${pc.dim("→")} ${pc.dim(outStr)}`);
    } else {
      console.log(`  ${pc.dim("→")} ${pc.dim(outStr)}`);
    }
    console.log();
  }

  render(
    progress: ConversionProgress,
    hardware: HardwareUsage | null,
  ): void {
    const now = Date.now();
    if (now - this.lastPrintAt < THROTTLE_MS) return;
    this.lastPrintAt = now;

    this.clearProgress();

    const cols = process.stdout.columns ?? 80;
    const barWidth = Math.max(MIN_BAR_WIDTH, Math.min(40, cols - 20));

    const percent = getProgressPercent(progress);
    const bar = percent !== null ? this.buildBar(percent, barWidth) : this.buildIndeterminateBar(barWidth);
    const percentStr = percent !== null ? pc.bold(formatPercent(percent)) : pc.dim("processando...");

    const line1 = `  ${bar}  ${percentStr}`;

    // Unified metrics line: time · size · speed · ETA
    const metricParts: string[] = [];
    metricParts.push(this.formatTime(progress));

    const sizeStr = this.formatSize(progress);
    if (sizeStr) metricParts.push(sizeStr);

    const speedStr = formatSpeedMultiplier(progress.speed);
    if (speedStr !== "—") metricParts.push(`${speedStr}`);

    const eta = percent !== null && progress.speed && progress.totalTimeUs
      ? formatEtaFromProgress(progress.processedTimeUs, progress.totalTimeUs, progress.speed)
      : null;
    if (eta) metricParts.push(pc.cyan(`~${eta} restante`));

    const line2 = `  ${pc.dim(metricParts.join("  ·  "))}`;

    const lines = [line1, line2];

    if (hardware) {
      lines.push(this.formatHardware(hardware));
    }

    process.stdout.write(lines.join("\n"));
    this.linesWritten = lines.length;
  }

  finish(message: string): void {
    this.clearProgress();
    console.log(pc.green(`  ${message}`));
  }

  error(message: string): void {
    this.clearProgress();
    console.log(pc.red(`  ${message}`));
  }

  private buildBar(percent: number, width: number): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return pc.cyan("█".repeat(filled)) + pc.dim("░".repeat(empty));
  }

  private buildIndeterminateBar(width: number): string {
    const pos = Math.floor((Date.now() / 100) % width);
    const bar = "░".repeat(pos) + "█" + "░".repeat(width - pos - 1);
    return pc.cyan(bar);
  }

  private formatTime(progress: ConversionProgress): string {
    const processed = formatTimeFromUs(progress.processedTimeUs);
    if (progress.totalTimeUs) {
      const total = formatTimeFromUs(progress.totalTimeUs);
      return `${processed} / ${total}`;
    }
    return processed;
  }

  private formatSize(progress: ConversionProgress): string {
    if (!progress.inputBytes && !progress.outputBytes) return "";

    const input = progress.inputBytes ? formatFileSizeShort(progress.inputBytes) : "—";
    const output = progress.outputBytes ? formatFileSizeShort(progress.outputBytes) : "—";

    return `${input} → ${output}`;
  }

  private formatHardware(hw: HardwareUsage): string {
    const cpuBar = this.buildMiniBar(hw.cpuPercent, 10);
    const cpuColor = hw.cpuPercent >= 90 ? pc.red : hw.cpuPercent >= 70 ? pc.yellow : pc.green;
    const cpuStr = `CPU ${cpuBar} ${cpuColor(`${Math.round(hw.cpuPercent)}%`)}`;

    const memStr = `RAM ${pc.dim(formatMemoryMb(hw.memoryUsedMb, hw.memoryTotalMb))}`;

    if (hw.gpuPercent !== null) {
      const useEncoder = hw.gpuEncoderPercent !== null && hw.gpuEncoderPercent > hw.gpuPercent;
      const displayPercent = useEncoder ? hw.gpuEncoderPercent! : hw.gpuPercent;
      const gpuLabel = useEncoder ? "GPU(enc)" : "GPU";
      const gpuBar = this.buildMiniBar(displayPercent, 10);
      const gpuColor = displayPercent >= 90 ? pc.red : displayPercent >= 70 ? pc.yellow : pc.green;
      const gpuStr = `${gpuLabel} ${gpuBar} ${gpuColor(`${Math.round(displayPercent)}%`)}`;

      const vramStr = hw.gpuMemoryUsedMb !== null && hw.gpuMemoryTotalMb !== null
        ? `VRAM ${pc.dim(formatMemoryMb(hw.gpuMemoryUsedMb, hw.gpuMemoryTotalMb))}`
        : "";

      const parts = [cpuStr, memStr, gpuStr];
      if (vramStr) parts.push(vramStr);
      return `  ${parts.join("   ")}`;
    }

    return `  ${cpuStr}   ${memStr}   ${pc.dim("GPU —")}`;
  }

  private buildMiniBar(percent: number, width: number): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return "▓".repeat(filled) + "░".repeat(empty);
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
