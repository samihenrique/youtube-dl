import type { HardwareAccel } from "../enums/hardware-accel.ts";

export interface HardwareDetector {
  detectAvailableAccel(): Promise<HardwareAccel[]>;
  getOptimalAccel(): Promise<HardwareAccel>;
  getCpuThreads(): number;
}
