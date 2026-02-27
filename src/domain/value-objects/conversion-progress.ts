export interface ConversionProgress {
  readonly frame: number;
  readonly fps: number;
  readonly processedTimeUs: number;
  readonly totalTimeUs: number | null;
  readonly speed: number | null;
  readonly outputBytes: number | null;
  readonly inputBytes: number | null;
}

export function createConversionProgress(data: {
  frame?: number;
  fps?: number;
  processedTimeUs?: number;
  totalTimeUs?: number | null;
  speed?: number | null;
  outputBytes?: number | null;
  inputBytes?: number | null;
}): ConversionProgress {
  return {
    frame: data.frame ?? 0,
    fps: data.fps ?? 0,
    processedTimeUs: data.processedTimeUs ?? 0,
    totalTimeUs: data.totalTimeUs ?? null,
    speed: data.speed ?? null,
    outputBytes: data.outputBytes ?? null,
    inputBytes: data.inputBytes ?? null,
  };
}

export function getProgressPercent(progress: ConversionProgress): number | null {
  if (progress.totalTimeUs === null || progress.totalTimeUs <= 0) return null;
  const percent = (progress.processedTimeUs / progress.totalTimeUs) * 100;
  return Math.min(100, Math.max(0, percent));
}
