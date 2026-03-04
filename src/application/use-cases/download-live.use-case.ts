import type { DownloadTask } from "../../domain/entities/download-task.ts";
import type { DashFormat } from "../../domain/entities/video-info.ts";
import { DownloadMode } from "../../domain/enums/download-mode.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import type { MediaRemuxer } from "../../domain/ports/media-remuxer.port.ts";
import type { ProgressReporter } from "../../domain/ports/progress-reporter.port.ts";
import type { SegmentDownloader } from "../../domain/ports/segment-downloader.port.ts";
import type { VideoInfoProvider } from "../../domain/ports/video-info-provider.port.ts";
import { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { concatMediaFiles } from "../../infrastructure/helpers/ffmpeg-concat.ts";
import { formatSegmentDuration } from "../../infrastructure/helpers/format.ts";
import type { HlsParserService } from "../services/hls-parser.service.ts";
import type { SegmentDiscoveryService } from "../services/segment-discovery.service.ts";
import { buildOutputPath, resolveExistingFile } from "./shared/output-path.ts";

interface HlsDvrWindow {
  firstUrl: string;
  earliestSq: number;
  latestSq: number;
  variantHeight: number | null;
  variantBandwidth: number | null;
  refreshTemplate: () => Promise<string>;
}

const EXTENDED_DVR_LOOKBACK_SEGMENTS = 8_640; // ~12h @ 5s/segmento
const BATCH_THRESHOLD_SEGMENTS = 3_600; // ~5h: usa batch se total > este valor
const BATCH_SEGMENTS = 180; // ~15min por lote (renova URL com mais frequência)

function toPartPath(outputPath: string, partIndex: number): string {
  const extMatch = outputPath.match(/\.[^.]+$/);
  const ext = extMatch?.[0] ?? "";
  const base = ext ? outputPath.slice(0, -ext.length) : outputPath;
  return `${base}.part${partIndex}${ext}`;
}

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
    const dvrWindow = await this.resolveHlsDvrWindow(task);

    const dashFormats = task.videoInfo.dashFormats;
    const hasDash = dashFormats.length > 0;

    if (hasDash) {
      try {
        await this.downloadDvrDash(task, outputPath, dvrWindow);
        return;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.reporter.info(
          `DASH falhou (${message}). Tentando DVR via HLS...`,
        );
      }
    } else {
      this.reporter.info("DASH indisponível. Usando DVR via HLS...");
    }

    await this.downloadDvrHls(task, outputPath, dvrWindow);
  }

  private selectDashFormats(
    dashFormats: readonly DashFormat[],
    qualityLabel: string,
  ): {
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

    const video = this.selectDashVideoFormat(videoFormats, qualityLabel);
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

  private selectDashVideoFormat(
    videoFormats: readonly DashFormat[],
    qualityLabel: string,
  ): DashFormat {
    const byBitrate = [...videoFormats].sort((a, b) => b.bitrate - a.bitrate);
    const best = byBitrate[0]!;

    if (qualityLabel === "best" || qualityLabel === "audio-only") {
      return best;
    }

    const exactLabelMatches = videoFormats.filter(
      (f) => f.qualityLabel === qualityLabel,
    );
    if (exactLabelMatches.length > 0) {
      return [...exactLabelMatches].sort((a, b) => b.bitrate - a.bitrate)[0]!;
    }

    const requestedHeight = this.parseHeightLabel(qualityLabel);
    if (requestedHeight !== null) {
      const heightMatches = videoFormats.filter((f) => f.height === requestedHeight);
      if (heightMatches.length > 0) {
        return [...heightMatches].sort((a, b) => b.bitrate - a.bitrate)[0]!;
      }
    }

    return best;
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
    dvrWindow: HlsDvrWindow,
  ): Promise<void> {
    const { video: videoFormat, audio: audioFormat } = this.selectDashFormats(
      task.videoInfo.dashFormats,
      task.qualityLabel,
    );

    this.reporter.info(
      `Formato: ${videoFormat.qualityLabel ?? "melhor"} (${Math.round(videoFormat.bitrate / 1000)}kbps vídeo + ${Math.round(audioFormat.bitrate / 1000)}kbps áudio)`,
    );

    const { earliestSq, latestSq } = dvrWindow;

    const { startSq, endSq, knownMissingUntilSq } = this.resolveDownloadRange(
      task,
      earliestSq,
      latestSq,
    );

    const totalSegments = endSq - startSq + 1;
    const totalDvrSegments = latestSq - earliestSq + 1;
    const estimatedTotalBytes = this.estimateTotalBytes(
      totalSegments,
      videoFormat.bitrate + audioFormat.bitrate,
    );

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

    if (totalSegments <= BATCH_THRESHOLD_SEGMENTS) {
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
          estimatedTotalBytes,
          refreshVideoUrl,
          refreshAudioUrl,
          knownMissingUntilSq,
        },
        (progress) => this.reporter.update(progress),
      );
    } else {
      await this.downloadDashInBatches(
        task,
        outputPath,
        startSq,
        endSq,
        totalSegments,
        estimatedTotalBytes ?? undefined,
        refreshVideoUrl,
        refreshAudioUrl,
        knownMissingUntilSq,
      );
    }
  }

  private async downloadDashInBatches(
    task: DownloadTask,
    outputPath: string,
    startSq: number,
    endSq: number,
    totalSegments: number,
    estimatedTotalBytes: number | undefined,
    refreshVideoUrl: () => Promise<string>,
    refreshAudioUrl: () => Promise<string>,
    knownMissingUntilSq: number | undefined,
  ): Promise<void> {
    const batches: { start: number; end: number }[] = [];
    for (let s = startSq; s <= endSq; s += BATCH_SEGMENTS) {
      const batchEnd = Math.min(s + BATCH_SEGMENTS - 1, endSq);
      batches.push({ start: s, end: batchEnd });
    }

    this.reporter.info(
      `Modo batch: ${batches.length} lotes de ~${formatSegmentDuration(BATCH_SEGMENTS)} (URL renovada a cada lote)`,
    );

    const partPaths: string[] = [];
    let segmentOffset = 0;
    let bytesOffset = 0;
    const startedAt = Date.now();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      this.reporter.info(
        `Lote ${i + 1}/${batches.length} (${formatSegmentDuration(batch.end - batch.start + 1)})...`,
      );

      const freshVideoUrl = await refreshVideoUrl();
      const freshAudioUrl = await refreshAudioUrl();

      const partPath = toPartPath(outputPath, i);

      await this.segmentDownloader.download(
        {
          segmentTemplateUrl: freshVideoUrl,
          audioTemplateUrl: freshAudioUrl,
          startSq: batch.start,
          endSq: batch.end,
          outputPath: partPath,
          concurrency: task.concurrency,
          retries: task.retries,
          timeoutSeconds: task.timeoutSeconds,
          urlMode: "dash",
          estimatedTotalBytes: undefined,
          refreshVideoUrl,
          refreshAudioUrl,
          knownMissingUntilSq: i === 0 ? knownMissingUntilSq : undefined,
        },
        (progress) =>
          this.reporter.update(
            new DownloadProgress(
              bytesOffset + progress.downloadedBytes,
              estimatedTotalBytes ?? null,
              Date.now() - startedAt,
              segmentOffset + progress.downloadedSegments,
              totalSegments,
            ),
          ),
      );

      segmentOffset += batch.end - batch.start + 1;
      try {
        const stat = await Bun.file(partPath).stat();
        bytesOffset += stat.size;
      } catch {
        /* best-effort */
      }
      partPaths.push(partPath);
    }

    this.reporter.info("Mesclando lotes...");
    await concatMediaFiles(partPaths, outputPath);
  }

  private selectHlsVariant(
    variants: ReturnType<HlsParserService["parseVariants"]>,
    qualityLabel: string,
  ) {
    if (qualityLabel === "best" || qualityLabel === "audio-only") {
      return variants[0]!;
    }

    const requestedHeight = this.parseHeightLabel(qualityLabel);
    if (requestedHeight !== null) {
      const exact = variants.find((v) => v.resolution?.height === requestedHeight);
      if (exact) return exact;
    }

    return variants[0]!;
  }

  private parseHeightLabel(label: string): number | null {
    const match = /^(\d{3,4})p$/i.exec(label.trim());
    return match ? Number(match[1]) : null;
  }

  private async resolveHlsDvrWindow(task: DownloadTask): Promise<HlsDvrWindow> {
    const manifestText = await this.fetchText(task.videoInfo.hlsManifestUrl!);
    const variants = this.hlsParser.parseVariants(manifestText);

    if (variants.length === 0) {
      throw new DownloadFailedError(
        "Não foi possível extrair variantes HLS do manifesto.",
      );
    }

    const chosen = this.selectHlsVariant(variants, task.qualityLabel);
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
      const freshChosen = this.selectHlsVariant(freshVariants, task.qualityLabel);
      const freshVariantText = await this.fetchText(freshChosen.url);
      const freshSegments =
        this.hlsParser.parseSegmentUrls(freshVariantText);
      if (freshSegments.length === 0) {
        throw new DownloadFailedError(
          "Falha ao renovar manifesto HLS: sem segmentos.",
        );
      }
      return freshSegments[0]!;
    };

    if (chosen.resolution?.height) {
      this.reporter.info(`Formato HLS: ${chosen.resolution.height}p`);
    }
    this.reporter.info("Procurando início da gravação...");
    const maxSegments =
      task.maxDurationSeconds !== null
        ? Math.ceil(task.maxDurationSeconds / 5)
        : EXTENDED_DVR_LOOKBACK_SEGMENTS;
    const maxLookback = Math.max(1, maxSegments);
    const earliestSq = await this.segmentDiscovery.findEarliestAvailableSq(
      firstUrl,
      latestSq,
      refreshTemplate,
      maxLookback,
    );

    return {
      firstUrl,
      earliestSq,
      latestSq,
      variantHeight: chosen.resolution?.height ?? null,
      variantBandwidth: chosen.bandwidth > 0 ? chosen.bandwidth : null,
      refreshTemplate,
    };
  }

  private async downloadDvrHls(
    task: DownloadTask,
    outputPath: string,
    dvrWindow: HlsDvrWindow,
  ): Promise<void> {
    const {
      firstUrl,
      earliestSq,
      latestSq,
      variantHeight,
      variantBandwidth,
      refreshTemplate,
    } =
      dvrWindow;

    if (variantHeight !== null) {
      this.reporter.info(`Formato: ${variantHeight}p (HLS)`);
    }

    const { startSq, endSq, knownMissingUntilSq } = this.resolveDownloadRange(
      task,
      earliestSq,
      latestSq,
    );

    const totalSegments = endSq - startSq + 1;
    const totalDvrSegments = latestSq - earliestSq + 1;
    const estimatedTotalBytes = this.estimateTotalBytes(
      totalSegments,
      variantBandwidth,
    );

    this.reporter.info(
      `Janela DVR: ${totalDvrSegments} segmentos (${formatSegmentDuration(totalDvrSegments)})`,
    );
    this.reporter.info(
      `Baixando ${totalSegments} segmentos (${formatSegmentDuration(totalSegments)})`,
    );

    if (totalSegments <= BATCH_THRESHOLD_SEGMENTS) {
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
          estimatedTotalBytes,
          refreshVideoUrl: refreshTemplate,
          knownMissingUntilSq,
        },
        (progress) => this.reporter.update(progress),
      );
    } else {
      await this.downloadHlsInBatches(
        task,
        outputPath,
        startSq,
        endSq,
        totalSegments,
        estimatedTotalBytes ?? null,
        refreshTemplate,
        knownMissingUntilSq,
      );
    }
  }

  private async downloadHlsInBatches(
    task: DownloadTask,
    outputPath: string,
    startSq: number,
    endSq: number,
    totalSegments: number,
    estimatedTotalBytes: number | null,
    refreshTemplate: () => Promise<string>,
    knownMissingUntilSq: number | undefined,
  ): Promise<void> {
    const batches: { start: number; end: number }[] = [];
    for (let s = startSq; s <= endSq; s += BATCH_SEGMENTS) {
      const batchEnd = Math.min(s + BATCH_SEGMENTS - 1, endSq);
      batches.push({ start: s, end: batchEnd });
    }

    this.reporter.info(
      `Modo batch: ${batches.length} lotes de ~${formatSegmentDuration(BATCH_SEGMENTS)} (URL renovada a cada lote)`,
    );

    const partPaths: string[] = [];
    let segmentOffset = 0;
    let bytesOffset = 0;
    const startedAt = Date.now();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      this.reporter.info(
        `Lote ${i + 1}/${batches.length} (${formatSegmentDuration(batch.end - batch.start + 1)})...`,
      );

      const freshTemplate = await refreshTemplate();
      const partPath = toPartPath(outputPath, i);

      await this.segmentDownloader.download(
        {
          segmentTemplateUrl: freshTemplate,
          startSq: batch.start,
          endSq: batch.end,
          outputPath: partPath,
          concurrency: task.concurrency,
          retries: task.retries,
          timeoutSeconds: task.timeoutSeconds,
          urlMode: "hls",
          estimatedTotalBytes: undefined,
          refreshVideoUrl: refreshTemplate,
          knownMissingUntilSq: i === 0 ? knownMissingUntilSq : undefined,
        },
        (progress) =>
          this.reporter.update(
            new DownloadProgress(
              bytesOffset + progress.downloadedBytes,
              estimatedTotalBytes,
              Date.now() - startedAt,
              segmentOffset + progress.downloadedSegments,
              totalSegments,
            ),
          ),
      );

      segmentOffset += batch.end - batch.start + 1;
      try {
        const stat = await Bun.file(partPath).stat();
        bytesOffset += stat.size;
      } catch {
        /* best-effort */
      }
      partPaths.push(partPath);
    }

    this.reporter.info("Mesclando lotes...");
    await concatMediaFiles(partPaths, outputPath);
  }

  private resolveDownloadRange(
    task: DownloadTask,
    earliestSq: number,
    latestSq: number,
  ): { startSq: number; endSq: number; knownMissingUntilSq?: number } {
    let startSq = earliestSq;
    const endSq = latestSq;
    let knownMissingUntilSq: number | undefined;

    if (task.maxDurationSeconds !== null) {
      // Sempre as N horas mais recentes: [latestSq - maxSegments + 1, latestSq]
      const maxSegments = Math.max(1, Math.ceil(task.maxDurationSeconds / 5));
      startSq = Math.max(earliestSq, latestSq - maxSegments + 1);
      return { startSq, endSq };
    }

    // Modo estendido: tenta ~12h mesmo que a descoberta ache menos,
    // pulando segmentos indisponíveis (comportamento próximo ao yt-dlp).
    const extendedStart = Math.max(1, latestSq - EXTENDED_DVR_LOOKBACK_SEGMENTS + 1);
    if (extendedStart < startSq) {
      this.reporter.info(
        "Varredura estendida ativa: tentando até ~12h e ignorando segmentos indisponíveis.",
      );
      knownMissingUntilSq = earliestSq - 1;
      const skipped = Math.max(0, knownMissingUntilSq - extendedStart + 1);
      if (skipped > 0) {
        this.reporter.info(
          `Ignorando ${skipped} segmentos iniciais já indisponíveis na janela estendida.`,
        );
      }
      startSq = extendedStart;
    }

    return { startSq, endSq, knownMissingUntilSq };
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

  private estimateTotalBytes(
    totalSegments: number,
    bitrateBps: number | null,
  ): number | undefined {
    if (!bitrateBps || bitrateBps <= 0) return undefined;
    const totalSeconds = totalSegments * 5;
    return Math.round((bitrateBps * totalSeconds) / 8);
  }
}
