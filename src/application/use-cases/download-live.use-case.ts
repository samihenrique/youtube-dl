import type { DownloadTask } from "../../domain/entities/download-task.ts";
import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type { MediaRemuxer } from "../../domain/ports/media-remuxer.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { SegmentDownloader } from "../../domain/ports/segment-downloader.port.ts";
import type { HlsParserService } from "../services/hls-parser.service.ts";
import type { SegmentDiscoveryService } from "../services/segment-discovery.service.ts";
import { buildOutputPath, resolveExistingFile } from "./shared/output-path.ts";

export class DownloadLiveUseCase {
  constructor(
    private readonly segmentDownloader: SegmentDownloader,
    private readonly remuxer: MediaRemuxer,
    private readonly hlsParser: HlsParserService,
    private readonly segmentDiscovery: SegmentDiscoveryService,
    private readonly reporter: ProgressReporter,
  ) {}

  async execute(task: DownloadTask): Promise<string> {
    const { videoInfo } = task;
    if (
      videoInfo.type !== VideoType.Live &&
      videoInfo.type !== VideoType.PostLiveDvr
    ) {
      throw new DownloadFailedError(
        "Este use case é para lives. Use o DownloadVideoUseCase para vídeos comuns.",
      );
    }

    if (!videoInfo.hlsManifestUrl) {
      throw new DownloadFailedError(
        "Não foi possível obter o manifesto HLS da live.",
      );
    }

    const rawPath = buildOutputPath(task);
    const outputPath = resolveExistingFile(rawPath, task.overwrite);
    if (outputPath === null) {
      this.reporter.finish(`Arquivo já existe, pulando: ${rawPath}`);
      return rawPath;
    }

    this.reporter.start(`Baixando live: ${videoInfo.title}`);

    try {
      if (task.liveMode === DownloadMode.LiveNow) {
        await this.downloadLiveNow(task, outputPath);
      } else {
        await this.downloadDvr(task, outputPath);
      }
    } catch (error: unknown) {
      this.reporter.error("Download da live falhou");
      throw new DownloadFailedError("Erro durante o download da live", {
        cause: error,
      });
    }

    this.reporter.finish(`Download concluído: ${outputPath}`);
    return outputPath;
  }

  private async downloadLiveNow(
    task: DownloadTask,
    outputPath: string,
  ): Promise<void> {
    await this.remuxer.remux(
      {
        manifestUrl: task.videoInfo.hlsManifestUrl!,
        outputPath,
        maxDurationSeconds: task.maxDurationSeconds ?? undefined,
      },
      (progress) => this.reporter.update(progress),
    );
  }

  private async downloadDvr(
    task: DownloadTask,
    outputPath: string,
  ): Promise<void> {
    const manifestText = await this.fetchText(task.videoInfo.hlsManifestUrl!);
    const variants = this.hlsParser.parseVariants(manifestText);

    if (variants.length === 0) {
      throw new DownloadFailedError(
        "Não foi possível extrair variantes HLS do manifesto.",
      );
    }

    const chosen = variants[0]!;
    const variantManifestText = await this.fetchText(chosen.url);
    const segmentUrls = this.hlsParser.parseSegmentUrls(variantManifestText);

    if (segmentUrls.length === 0) {
      throw new DownloadFailedError(
        "Não foi possível extrair segmentos do manifesto HLS.",
      );
    }

    const firstUrl = segmentUrls[0]!;
    const lastUrl = segmentUrls[segmentUrls.length - 1]!;
    const latestSq = this.hlsParser.extractSqFromUrl(lastUrl);

    const earliestSq = await this.segmentDiscovery.findEarliestAvailableSq(
      firstUrl,
      latestSq,
    );

    let endSq = latestSq;
    if (task.maxDurationSeconds !== null) {
      const maxSegments = Math.max(
        1,
        Math.ceil(task.maxDurationSeconds / 5),
      );
      endSq = Math.min(latestSq, earliestSq + maxSegments - 1);
    }

    const totalSegments = endSq - earliestSq + 1;
    const estimatedDurationSeconds = totalSegments * 5;
    const hours = Math.floor(estimatedDurationSeconds / 3600);
    const minutes = Math.floor((estimatedDurationSeconds % 3600) / 60);
    console.log(
      `[dvr] Janela disponível: sq ${earliestSq}..${endSq} (${totalSegments} segmentos, ~${hours}h${String(minutes).padStart(2, "0")}m)`,
    );

    await this.segmentDownloader.download(
      {
        segmentTemplateUrl: firstUrl,
        startSq: earliestSq,
        endSq,
        outputPath,
        concurrency: task.concurrency,
        retries: task.retries,
        timeoutSeconds: task.timeoutSeconds,
      },
      (progress) => this.reporter.update(progress),
    );
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new DownloadFailedError(
        `Falha ao buscar manifesto HLS (HTTP ${response.status})`,
      );
    }
    return response.text();
  }
}
