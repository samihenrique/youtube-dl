import type { ConversionTask } from "../entities/conversion-task.ts";
import type { ConversionProgress } from "../value-objects/conversion-progress.ts";

export interface InputMediaInfo {
  durationUs: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  videoBitrateKbps: number | null;
}

export interface MediaConverter {
  convert(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
    onProgress?: (progress: ConversionProgress) => void,
  ): Promise<void>;

  getInputFileSize(inputPath: string): Promise<number>;

  getInputInfo(inputPath: string): Promise<InputMediaInfo | null>;
}
