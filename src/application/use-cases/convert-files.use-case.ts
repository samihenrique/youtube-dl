import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { ConversionFailedError } from "../../domain/errors/conversion-failed.error.ts";
import type { HardwareMonitor } from "../../domain/ports/hardware-monitor.port.ts";
import type { MediaConverter } from "../../domain/ports/media-converter.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { HardwareUsage } from "../../domain/value-objects/hardware-usage.ts";
import { ConversionProgressRenderer } from "../../presentation/renderers/conversion-progress.renderer.ts";

export interface ConvertFilesResult {
  success: string[];
  failed: { file: string; error: string }[];
}

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v"];

export class ConvertFilesUseCase {
  private readonly progressRenderer = new ConversionProgressRenderer();

  constructor(
    private readonly converter: MediaConverter,
    private readonly reporter: ProgressReporter,
    private readonly hardwareMonitor: HardwareMonitor | null,
  ) {}

  async execute(
    inputDir: string,
    task: ConversionTask,
    files?: string[],
  ): Promise<ConvertFilesResult> {
    this.reporter.start(`Escaneando diretório: ${inputDir}`);

    const filesToConvert = files ?? (await this.listVideoFiles(inputDir));

    if (filesToConvert.length === 0) {
      this.reporter.finish("Nenhum arquivo de vídeo encontrado");
      return { success: [], failed: [] };
    }

    this.reporter.finish(`${filesToConvert.length} arquivo(s) encontrado(s)`);

    const result: ConvertFilesResult = { success: [], failed: [] };

    for (let i = 0; i < filesToConvert.length; i++) {
      const file = filesToConvert[i]!;
      const inputPath = path.isAbsolute(file) ? file : path.join(inputDir, file);

      console.log();
      console.log(`  ${i + 1}/${filesToConvert.length}`);
      console.log();

      try {
        const ext = task.extractAudio ?? task.outputFormat;
        const outputPath = this.getOutputPath(inputPath, ext);

        await this.convertWithProgress(inputPath, outputPath, task);

        console.log();
        this.progressRenderer.finish(`Concluído: ${path.basename(outputPath)}`);
        result.success.push(outputPath);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log();
        this.progressRenderer.error(`Falhou: ${path.basename(file)}`);
        result.failed.push({ file, error: message });
      }
    }

    return result;
  }

  private async convertWithProgress(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
  ): Promise<void> {
    const filename = path.basename(inputPath);

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
    } finally {
      stopMonitoring?.();
    }
  }

  private async listVideoFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (VIDEO_EXTENSIONS.includes(ext)) {
            files.push(entry.name);
          }
        }
      }

      return files.sort();
    } catch {
      throw new ConversionFailedError(`Não foi possível ler o diretório: ${dir}`);
    }
  }

  private getOutputPath(inputPath: string, ext: string): string {
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    return path.join(dir, `${base}.converted.${ext}`);
  }
}
