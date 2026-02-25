import { ConvertMediaUseCase } from "./application/use-cases/convert-media.use-case.ts";
import { DownloadLiveUseCase } from "./application/use-cases/download-live.use-case.ts";
import { DownloadVideoUseCase } from "./application/use-cases/download-video.use-case.ts";
import { ResolveVideoInfoUseCase } from "./application/use-cases/resolve-video-info.use-case.ts";
import { HlsParserService } from "./application/services/hls-parser.service.ts";
import { SegmentDiscoveryService } from "./application/services/segment-discovery.service.ts";
import { FfmpegConverterAdapter } from "./infrastructure/adapters/ffmpeg-converter.adapter.ts";
import { FfmpegRemuxerAdapter } from "./infrastructure/adapters/ffmpeg-remuxer.adapter.ts";
import { HttpSegmentDownloaderAdapter } from "./infrastructure/adapters/http-segment-downloader.adapter.ts";
import { YoutubeInfoAdapter } from "./infrastructure/adapters/youtube-info.adapter.ts";
import { YoutubeVideoDownloaderAdapter } from "./infrastructure/adapters/youtube-video-downloader.adapter.ts";
import type { AppDependencies } from "./presentation/cli/app.ts";
import { CliProgressRenderer } from "./presentation/renderers/progress.renderer.ts";

export function createContainer(): AppDependencies {
  const reporter = new CliProgressRenderer();

  const youtubeInfo = new YoutubeInfoAdapter();
  const videoDownloader = new YoutubeVideoDownloaderAdapter();
  const segmentDownloader = new HttpSegmentDownloaderAdapter();
  const remuxer = new FfmpegRemuxerAdapter();
  const converter = new FfmpegConverterAdapter();

  const hlsParser = new HlsParserService();

  const SEGMENT_CHECK_RETRIES = 3;
  const SEGMENT_CHECK_TIMEOUT_MS = 10_000;

  const segmentExistsChecker = async (url: string): Promise<boolean> => {
    for (let attempt = 0; attempt < SEGMENT_CHECK_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          SEGMENT_CHECK_TIMEOUT_MS,
        );

        const response = await fetch(url, {
          headers: { Range: "bytes=0-64" },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) return false;

        const ct = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (ct.includes("text/plain") || ct.includes("text/html")) return false;

        const data = new Uint8Array(await response.arrayBuffer());
        return data.byteLength > 0;
      } catch (error: unknown) {
        const isLastAttempt = attempt === SEGMENT_CHECK_RETRIES - 1;
        if (isLastAttempt) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[warn] Falha ao verificar segmento após ${SEGMENT_CHECK_RETRIES} tentativas: ${msg}`);
          throw error;
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return false;
  };

  const segmentDiscovery = new SegmentDiscoveryService(
    segmentExistsChecker,
    (template, sq) => hlsParser.buildSegmentUrl(template, sq),
  );

  return {
    resolveVideoInfo: new ResolveVideoInfoUseCase(youtubeInfo),
    downloadVideo: new DownloadVideoUseCase(videoDownloader, reporter),
    downloadLive: new DownloadLiveUseCase(
      segmentDownloader,
      remuxer,
      hlsParser,
      segmentDiscovery,
      reporter,
    ),
    convertMedia: new ConvertMediaUseCase(converter, reporter),
  };
}
