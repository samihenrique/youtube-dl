import * as os from "node:os";
import type { HardwareMonitor } from "../../domain/ports/hardware-monitor.port.ts";
import type { HardwareUsage } from "../../domain/value-objects/hardware-usage.ts";
import { createHardwareUsage } from "../../domain/value-objects/hardware-usage.ts";

export class SystemHardwareMonitor implements HardwareMonitor {
  private nvidiaGpuName: string | null = null;
  private nvidiaAvailable: boolean | null = null;

  async getUsage(): Promise<HardwareUsage> {
    const cpuPercent = await this.getCpuUsage();
    const { usedMb, totalMb } = this.getMemoryUsage();
    const gpuStats = await this.getGpuUsage();

    return createHardwareUsage({
      cpuPercent,
      memoryUsedMb: usedMb,
      memoryTotalMb: totalMb,
      gpuPercent: gpuStats?.percent ?? null,
      gpuEncoderPercent: gpuStats?.encoderPercent ?? null,
      gpuDecoderPercent: gpuStats?.decoderPercent ?? null,
      gpuMemoryUsedMb: gpuStats?.memoryUsedMb ?? null,
      gpuMemoryTotalMb: gpuStats?.memoryTotalMb ?? null,
      gpuName: gpuStats?.name ?? null,
    });
  }

  startMonitoring(intervalMs: number, onStats: (usage: HardwareUsage) => void): () => void {
    let running = true;

    const monitor = async (): Promise<void> => {
      while (running) {
        try {
          const usage = await this.getUsage();
          onStats(usage);
        } catch {
          // Ignore errors during monitoring
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    };

    monitor();

    return () => {
      running = false;
    };
  }

  private async getCpuUsage(): Promise<number> {
    if (process.platform === "linux") {
      return this.getCpuUsageFromProcStat();
    }
    return this.getCpuUsageFromOsCpus();
  }

  private async getCpuUsageFromProcStat(): Promise<number> {
    const read = async (): Promise<{ active: number; total: number }> => {
      const content = await Bun.file("/proc/stat").text();
      const line = content.split("\n")[0] ?? "";
      const parts = line.split(/\s+/).slice(1).map(Number);
      const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = parts;
      const active = user + nice + system + irq + softirq + steal;
      const total = active + idle + iowait;
      return { active, total };
    };

    const s1 = await read();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const s2 = await read();

    const activeDiff = s2.active - s1.active;
    const totalDiff = s2.total - s1.total;

    if (totalDiff === 0) return 0;
    const usage = (activeDiff / totalDiff) * 100;
    return Math.min(100, Math.max(0, usage));
  }

  private async getCpuUsageFromOsCpus(): Promise<number> {
    const cpus1 = os.cpus();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cpus2 = os.cpus();

    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < cpus1.length; i++) {
      const cpu1 = cpus1[i];
      const cpu2 = cpus2[i];
      if (!cpu1 || !cpu2) continue;

      const idleDiff = cpu2.times.idle - cpu1.times.idle;
      const tickDiff =
        (cpu2.times.user - cpu1.times.user) +
        (cpu2.times.nice - cpu1.times.nice) +
        (cpu2.times.sys - cpu1.times.sys) +
        (cpu2.times.irq - cpu1.times.irq) +
        idleDiff;

      totalIdle += idleDiff;
      totalTick += tickDiff;
    }

    if (totalTick === 0) return 0;
    const usage = ((totalTick - totalIdle) / totalTick) * 100;
    return Math.min(100, Math.max(0, usage));
  }

  private getMemoryUsage(): { usedMb: number; totalMb: number } {
    const totalMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMb = Math.round(os.freemem() / (1024 * 1024));
    const usedMb = totalMb - freeMb;
    return { usedMb, totalMb };
  }

  private async getGpuUsage(): Promise<{
    percent: number;
    encoderPercent: number | null;
    decoderPercent: number | null;
    memoryUsedMb: number;
    memoryTotalMb: number;
    name: string;
  } | null> {
    if (this.nvidiaAvailable === false) return null;

    if (this.nvidiaAvailable === null) {
      this.nvidiaAvailable = await this.checkNvidiaSmi();
    }

    if (!this.nvidiaAvailable) return null;

    try {
      const proc = Bun.spawn(
        [
          "nvidia-smi",
          "--query-gpu=utilization.gpu,utilization.encoder,utilization.decoder,memory.used,memory.total,name",
          "--format=csv,noheader,nounits",
        ],
        {
          stdout: "pipe",
          stderr: "ignore",
        },
      );

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) return null;

      const parts = output.trim().split(",").map((p) => p.trim());
      if (parts.length < 6) return null;

      const percent = parseFloat(parts[0] ?? "0");
      const encoderRaw = parseFloat(parts[1] ?? "");
      const decoderRaw = parseFloat(parts[2] ?? "");
      const memoryUsedMb = parseFloat(parts[3] ?? "0");
      const memoryTotalMb = parseFloat(parts[4] ?? "0");
      const name = (parts[5] ?? "NVIDIA GPU").trim();

      if (!this.nvidiaGpuName) {
        this.nvidiaGpuName = name;
      }

      return {
        percent: Number.isFinite(percent) ? percent : 0,
        encoderPercent: Number.isFinite(encoderRaw) ? encoderRaw : null,
        decoderPercent: Number.isFinite(decoderRaw) ? decoderRaw : null,
        memoryUsedMb: Number.isFinite(memoryUsedMb) ? memoryUsedMb : 0,
        memoryTotalMb: Number.isFinite(memoryTotalMb) ? memoryTotalMb : 0,
        name: this.nvidiaGpuName,
      };
    } catch {
      return null;
    }
  }

  private async checkNvidiaSmi(): Promise<boolean> {
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
