export interface HardwareUsage {
  readonly cpuPercent: number;
  readonly memoryUsedMb: number;
  readonly memoryTotalMb: number;
  readonly gpuPercent: number | null;
  readonly gpuEncoderPercent: number | null;
  readonly gpuDecoderPercent: number | null;
  readonly gpuMemoryUsedMb: number | null;
  readonly gpuMemoryTotalMb: number | null;
  readonly gpuName: string | null;
}

export function createHardwareUsage(data: {
  cpuPercent?: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  gpuPercent?: number | null;
  gpuEncoderPercent?: number | null;
  gpuDecoderPercent?: number | null;
  gpuMemoryUsedMb?: number | null;
  gpuMemoryTotalMb?: number | null;
  gpuName?: string | null;
}): HardwareUsage {
  return {
    cpuPercent: data.cpuPercent ?? 0,
    memoryUsedMb: data.memoryUsedMb ?? 0,
    memoryTotalMb: data.memoryTotalMb ?? 0,
    gpuPercent: data.gpuPercent ?? null,
    gpuEncoderPercent: data.gpuEncoderPercent ?? null,
    gpuDecoderPercent: data.gpuDecoderPercent ?? null,
    gpuMemoryUsedMb: data.gpuMemoryUsedMb ?? null,
    gpuMemoryTotalMb: data.gpuMemoryTotalMb ?? null,
    gpuName: data.gpuName ?? null,
  };
}
