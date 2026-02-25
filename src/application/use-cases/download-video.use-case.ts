import type { DownloadTask } from "../../domain/entities/download-task.ts";
import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { VideoDownloader } from "../../domain/ports/video-downloader.port.ts";
import { buildOutputPath, resolveExistingFile } from "./shared/output-path.ts";

export class DownloadVideoUseCase {
  constructor(
    private readonly downloader: VideoDownloader,
    private readonly reporter: ProgressReporter,
  ) {}

  async execute(task: DownloadTask): Promise<string> {
    if (task.videoInfo.type !== VideoType.Video) {
      throw new DownloadFailedError(
        `Este use case é para vídeos comuns, mas o tipo detectado é "${task.videoInfo.type}". ` +
          "Use o DownloadLiveUseCase para lives.",
      );
    }

    const rawPath = buildOutputPath(task);
    const outputPath = resolveExistingFile(rawPath, task.overwrite);
    if (outputPath === null) {
      this.reporter.finish(`Arquivo já existe, pulando: ${rawPath}`);
      return rawPath;
    }

    this.reporter.start(`Baixando: ${task.videoInfo.title}`);

    try {
      await this.downloader.download(
        task.videoInfo.id,
        outputPath,
        (progress) => this.reporter.update(progress),
      );
    } catch (error: unknown) {
      this.reporter.error("Download falhou");
      throw new DownloadFailedError("Erro durante o download do vídeo", {
        cause: error,
      });
    }

    this.reporter.finish(`Download concluído: ${outputPath}`);
    return outputPath;
  }
}
