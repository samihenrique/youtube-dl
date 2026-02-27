import type { HardwareUsage } from "../value-objects/hardware-usage.ts";

export interface HardwareMonitor {
  getUsage(): Promise<HardwareUsage>;
  startMonitoring(intervalMs: number, onStats: (usage: HardwareUsage) => void): () => void;
}
