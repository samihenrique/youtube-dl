import type { DownloadTask } from "../../domain/entities/download-task.ts";
import type { DashFormat } from "../../domain/entities/video-info.ts";
import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type { MediaRemuxer } from "../../domain/ports/media-remuxer.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { SegmentDownloader } from "../../domain/ports/segment-downloader.port.ts";
import type { VideoInfoProvider } from "../../domain/ports/video-info-provider.port.ts";
import { formatSegmentDuration } from "../../infrastructure/helpers/format.ts";
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
    private readonly videoInfoProvider: VideoInfoProvider,
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
    const dashFormats = task.videoInfo.dashFormats;
    const hasDash = dashFormats.length > 0;

    if (hasDash) {
      await this.downloadDvrDash(task, outputPath);
    } else {
      await this.downloadDvrHls(task, outputPath);
    }
  }

  private selectDashFormats(dashFormats: readonly DashFormat[]): {
    video: DashFormat;
    audio: DashFormat;
  } {
    const videoFormats = dashFormats.filter((f) =>
      f.mimeType.startsWith("video/"),
    );
    const audioFormats = dashFormats.filter((f) =>
      f.mimeType.startsWith("audio/"),
    );

    if (videoFormats.length === 0 || audioFormats.length === 0) {
      throw new DownloadFailedError(
        "DASH: não há formatos de vídeo e/ou áudio disponíveis.",
      );
    }

    const video = videoFormats.sort((a, b) => b.bitrate - a.bitrate)[0]!;
    const audio =
      audioFormats
        .filter(
          (f) =>
            f.mimeType.includes("mp4a") || f.mimeType.includes("audio/mp4"),
        )
        .sort((a, b) => b.bitrate - a.bitrate)[0] ??
      audioFormats.sort((a, b) => b.bitrate - a.bitrate)[0]!;

    return { video, audio };
  }

  private async getFreshDashUrl(
    videoId: string,
    itag: number,
    type: "video" | "audio",
  ): Promise<string> {
    const freshInfo = await this.videoInfoProvider.resolve(videoId);
    const formats = freshInfo.dashFormats.filter((f) =>
      f.mimeType.startsWith(`${type}/`),
    );
    const match = formats.find((f) => f.itag === itag);
    if (!match) {
      throw new DownloadFailedError(
        `DASH: não foi possível obter URL fresca para itag ${itag}`,
      );
    }
    return match.url;
  }

  private async downloadDvrDash(
    task: DownloadTask,
    outputPath: string,
  ): Promise<void> {
    const { video: videoFormat, audio: audioFormat } = this.selectDashFormats(
      task.videoInfo.dashFormats,
    );

    this.reporter.info(
      `Formato: ${videoFormat.qualityLabel ?? "melhor"} (${Math.round(videoFormat.bitrate / 1000)}kbps vídeo + ${Math.round(audioFormat.bitrate / 1000)}kbps áudio)`,
    );

    const latestSq = await this.findLatestSqFromHls(task);

    const buildDashUrl = (template: string, sq: number) => {
      const url = new URL(template);
      url.searchParams.set("sq", String(sq));
      return url.toString();
    };

    const dashChecker = async (url: string): Promise<boolean> => {
      const response = await fetch(url, { headers: { Range: "bytes=0-64" } });
      if (response.status === 404 || response.status === 410) return false;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      return data.byteLength > 0;
    };

    const { SegmentDiscoveryService: SDS } = await import(
      "../services/segment-discovery.service.ts"
    );
    const dashDiscovery = new SDS(
      dashChecker,
      buildDashUrl,
      (msg) => this.reporter.info(msg),
    );

    const refreshVideoTemplate = async (): Promise<string> => {
      return this.getFreshDashUrl(task.videoInfo.id, videoFormat.itag, "video");
    };

    this.reporter.info("Procurando início da gravação...");

    const earliestSq = await dashDiscovery.findEarliestAvailableSq(
      videoFormat.url,
      latestSq,
      refreshVideoTemplate,
    );

    let startSq = earliestSq;
    let endSq = latestSq;
    if (task.maxDurationSeconds !== null) {
      const maxSegments = Math.max(1, Math.ceil(task.maxDurationSeconds / 5));
      startSq = Math.max(earliestSq, latestSq - maxSegments + 1);
    }

    const totalSegments = endSq - startSq + 1;
    const totalDvrSegments = latestSq - earliestSq + 1;

    this.reporter.info(
      `Janela DVR: ${totalDvrSegments} segmentos (${formatSegmentDuration(totalDvrSegments)})`,
    );
    this.reporter.info(
      `Baixando ${totalSegments} segmentos (${formatSegmentDuration(totalSegments)})`,
    );

    this.reporter.info("Preparando URLs de download...");
    const freshVideoUrl = await this.getFreshDashUrl(
      task.videoInfo.id,
      videoFormat.itag,
      "video",
    );
    const freshAudioUrl = await this.getFreshDashUrl(
      task.videoInfo.id,
      audioFormat.itag,
      "audio",
    );

    const refreshVideoUrl = () =>
      this.getFreshDashUrl(task.videoInfo.id, videoFormat.itag, "video");
    const refreshAudioUrl = () =>
      this.getFreshDashUrl(task.videoInfo.id, audioFormat.itag, "audio");

    await this.segmentDownloader.download(
      {
        segmentTemplateUrl: freshVideoUrl,
        audioTemplateUrl: freshAudioUrl,
        startSq,
        endSq,
        outputPath,
        concurrency: task.concurrency,
        retries: task.retries,
        timeoutSeconds: task.timeoutSeconds,
        urlMode: "dash",
        refreshVideoUrl,
        refreshAudioUrl,
      },
      (progress) => this.reporter.update(progress),
    );
  }

  private async findLatestSqFromHls(task: DownloadTask): Promise<number> {
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

    return this.hlsParser.extractSqFromUrl(
      segmentUrls[segmentUrls.length - 1]!,
    );
  }

  private async downloadDvrHls(
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
    const latestSq = this.hlsParser.extractSqFromUrl(
      segmentUrls[segmentUrls.length - 1]!,
    );

    const refreshTemplate = async (): Promise<string> => {
      const freshManifest = await this.fetchText(
        task.videoInfo.hlsManifestUrl!,
      );
      const freshVariants = this.hlsParser.parseVariants(freshManifest);
      if (freshVariants.length === 0) {
        throw new DownloadFailedError(
          "Falha ao renovar manifesto HLS: sem variantes.",
        );
      }
      const freshVariantText = await this.fetchText(freshVariants[0]!.url);
      const freshSegments =
        this.hlsParser.parseSegmentUrls(freshVariantText);
      if (freshSegments.length === 0) {
        throw new DownloadFailedError(
          "Falha ao renovar manifesto HLS: sem segmentos.",
        );
      }
      return freshSegments[0]!;
    };

    this.reporter.info("Procurando início da gravação...");

    const earliestSq = await this.segmentDiscovery.findEarliestAvailableSq(
      firstUrl,
      latestSq,
      refreshTemplate,
    );

    let startSq = earliestSq;
    let endSq = latestSq;
    if (task.maxDurationSeconds !== null) {
      const maxSegments = Math.max(1, Math.ceil(task.maxDurationSeconds / 5));
      startSq = Math.max(earliestSq, latestSq - maxSegments + 1);
    }

    const totalSegments = endSq - startSq + 1;
    const totalDvrSegments = latestSq - earliestSq + 1;

    this.reporter.info(
      `Janela DVR: ${totalDvrSegments} segmentos (${formatSegmentDuration(totalDvrSegments)})`,
    );
    this.reporter.info(
      `Baixando ${totalSegments} segmentos (${formatSegmentDuration(totalSegments)})`,
    );

    await this.segmentDownloader.download(
      {
        segmentTemplateUrl: firstUrl,
        startSq,
        endSq,
        outputPath,
        concurrency: task.concurrency,
        retries: task.retries,
        timeoutSeconds: task.timeoutSeconds,
        urlMode: "hls",
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
