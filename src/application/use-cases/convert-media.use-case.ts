import * as path from "node:path";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { ConversionFailedError } from "../../domain/errors/conversion-failed.error.ts";
import type { HardwareMonitor } from "../../domain/ports/hardware-monitor.port.ts";
import type { MediaConverter } from "../../domain/ports/media-converter.port.ts";
import type { HardwareUsage } from "../../domain/value-objects/hardware-usage.ts";
import { ConversionProgressRenderer } from "../../presentation/renderers/conversion-progress.renderer.ts";

export class ConvertMediaUseCase {
  private readonly progressRenderer = new ConversionProgressRenderer();

  constructor(
    private readonly converter: MediaConverter,
    private readonly hardwareMonitor: HardwareMonitor | null = null,
  ) {}

  async execute(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
  ): Promise<string> {
    const filename = path.basename(inputPath);

    // Fetch input metadata for header and real progress %
    const [inputSizeBytes, inputInfo] = await Promise.all([
      this.converter.getInputFileSize(inputPath).catch(() => null),
      this.converter.getInputInfo(inputPath),
    ]);

    this.progressRenderer.renderHeader({
      filename,
      inputSizeBytes,
      inputInfo,
      task,
    });

    let latestHardware: HardwareUsage | null = null;
    let stopMonitoring: (() => void) | null = null;

    if (this.hardwareMonitor) {
      stopMonitoring = this.hardwareMonitor.startMonitoring(500, (usage) => {
        latestHardware = usage;
      });
    }

    try {
      await this.converter.convert(inputPath, outputPath, task, (progress) => {
        this.progressRenderer.render(progress, latestHardware);
      });
    } catch (error: unknown) {
      console.log();
      this.progressRenderer.error("Conversão falhou");
      throw new ConversionFailedError("Erro durante a conversão do arquivo", {
        cause: error,
      });
    } finally {
      stopMonitoring?.();
    }

    console.log();
    this.progressRenderer.finish(`Concluído: ${path.basename(outputPath)}`);
    return outputPath;
  }
}
