import type { ConversionTask } from "../entities/conversion-task.ts";

export interface MediaConverter {
  convert(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
  ): Promise<void>;
}
