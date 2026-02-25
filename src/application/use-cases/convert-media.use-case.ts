import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { ConversionFailedError } from "../../domain/errors/conversion-failed.error.ts";
import type { MediaConverter } from "../../domain/ports/media-converter.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";

export class ConvertMediaUseCase {
  constructor(
    private readonly converter: MediaConverter,
    private readonly reporter: ProgressReporter,
  ) {}

  async execute(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
  ): Promise<string> {
    this.reporter.start(`Convertendo: ${inputPath}`);

    try {
      await this.converter.convert(inputPath, outputPath, task);
    } catch (error: unknown) {
      this.reporter.error("Conversão falhou");
      throw new ConversionFailedError("Erro durante a conversão do arquivo", {
        cause: error,
      });
    }

    this.reporter.finish(`Conversão concluída: ${outputPath}`);
    return outputPath;
  }
}
