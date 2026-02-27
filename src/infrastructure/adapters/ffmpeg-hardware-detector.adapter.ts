import { HardwareAccel } from "../../domain/enums/hardware-accel.ts";
import type { HardwareDetector } from "../../domain/ports/hardware-detector.port.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

export class FfmpegHardwareDetector implements HardwareDetector {
  private cachedAccel: HardwareAccel[] | null = null;

  async detectAvailableAccel(): Promise<HardwareAccel[]> {
    if (this.cachedAccel) return this.cachedAccel;

    const available: HardwareAccel[] = [HardwareAccel.None];
    const hwaccels = await this.getFfmpegHwaccels();

    if (hwaccels.includes("cuda") || hwaccels.includes("nvdec")) {
      const hasNvenc = await this.checkNvidiaGpu();
      if (hasNvenc) available.push(HardwareAccel.Nvenc);
    }

    if (hwaccels.includes("qsv")) {
      available.push(HardwareAccel.Qsv);
    }

    if (hwaccels.includes("vaapi")) {
      available.push(HardwareAccel.Vaapi);
    }

    if (hwaccels.includes("videotoolbox")) {
      available.push(HardwareAccel.Videotoolbox);
    }

    this.cachedAccel = available;
    return available;
  }

  async getOptimalAccel(): Promise<HardwareAccel> {
    const available = await this.detectAvailableAccel();

    if (available.includes(HardwareAccel.Nvenc)) return HardwareAccel.Nvenc;
    if (available.includes(HardwareAccel.Qsv)) return HardwareAccel.Qsv;
    if (available.includes(HardwareAccel.Videotoolbox)) return HardwareAccel.Videotoolbox;
    if (available.includes(HardwareAccel.Vaapi)) return HardwareAccel.Vaapi;

    return HardwareAccel.None;
  }

  getCpuThreads(): number {
    return navigator.hardwareConcurrency || 4;
  }

  private async getFfmpegHwaccels(): Promise<string[]> {
    try {
      const ffmpegBinary = await resolveFfmpegBinary();
      const proc = Bun.spawn([ffmpegBinary, "-hwaccels"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      return stdout
        .toLowerCase()
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    } catch {
      return [];
    }
  }

  private async checkNvidiaGpu(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["nvidia-smi", "-L"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      return exitCode === 0 && output.length > 0;
    } catch {
      return false;
    }
  }
}
