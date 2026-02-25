import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import type { DownloadTask } from "../../domain/entities/download-task.ts";
import type { VideoInfo } from "../../domain/entities/video-info.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { Bitrate } from "../../domain/value-objects/bitrate.ts";
import { TimeRange } from "../../domain/value-objects/time-range.ts";
import type { ConvertMediaUseCase } from "../../application/use-cases/convert-media.use-case.ts";
import type { DownloadLiveUseCase } from "../../application/use-cases/download-live.use-case.ts";
import type { DownloadVideoUseCase } from "../../application/use-cases/download-video.use-case.ts";
import type { ResolveVideoInfoUseCase } from "../../application/use-cases/resolve-video-info.use-case.ts";
import type { ParsedArgs } from "./args.ts";
import { promptUrl } from "./prompts/url.prompt.ts";
import {
  promptAction,
  promptQuality,
  promptLiveMode,
  promptCustomize,
  type ActionChoice,
} from "./prompts/action.prompt.ts";
import { promptConversion } from "./prompts/conversion-options.prompt.ts";
import { getSmartDefaults, isFfmpegAvailable } from "./defaults.ts";
import { handleError } from "./error-handler.ts";
import {
  renderVideoCard,
  renderVideoDetails,
  renderDownloadSummary,
} from "../renderers/summary.renderer.ts";

export interface AppDependencies {
  resolveVideoInfo: ResolveVideoInfoUseCase;
  downloadVideo: DownloadVideoUseCase;
  downloadLive: DownloadLiveUseCase;
  convertMedia: ConvertMediaUseCase;
}

export class CliApp {
  constructor(private readonly deps: AppDependencies) {}

  async run(args: ParsedArgs): Promise<void> {
    try {
      if (args.interactive) {
        await this.runInteractive();
      } else {
        await this.runNonInteractive(args);
      }
    } catch (error: unknown) {
      handleError(error);
      process.exit(1);
    }
  }

  private async runInteractive(): Promise<void> {
    console.log();
    console.log(
      pc.bold(pc.cyan("  youtube-dl")) +
        pc.dim("  ·  cola o link, baixa o vídeo"),
    );

    p.intro(pc.dim("─".repeat(Math.min(50, (process.stdout.columns ?? 60) - 4))));

    let continueLoop = true;
    while (continueLoop) {
      await this.runInteractiveSession();

      const again = await p.confirm({
        message: "Quer baixar outro vídeo?",
        initialValue: false,
      });

      if (p.isCancel(again) || !again) {
        continueLoop = false;
      }
    }

    p.outro(pc.dim("Até a próxima!"));
  }

  private async runInteractiveSession(): Promise<void> {
    const url = await promptUrl();

    const spinner = p.spinner();
    spinner.start("Buscando informações do vídeo...");

    let videoInfo: VideoInfo;
    try {
      videoInfo = await this.deps.resolveVideoInfo.execute(url);
      spinner.stop("Vídeo encontrado!");
    } catch (error: unknown) {
      spinner.stop("Não foi possível encontrar o vídeo");
      throw error;
    }

    renderVideoCard(videoInfo);

    const action = await promptAction(videoInfo);

    if (action === "info") {
      renderVideoDetails(videoInfo);
      return;
    }

    const { task, conversion } = await this.buildTaskFromAction(
      action,
      videoInfo,
    );

    renderDownloadSummary({
      videoInfo,
      quality: task.qualityLabel === "best" ? "Melhor disponível" : task.qualityLabel,
      outputDir: task.outputDir,
      liveMode: task.liveMode,
      conversion,
      concurrency: task.concurrency,
    });

    const confirmed = await p.confirm({
      message: "Tudo certo, pode começar?",
      initialValue: true,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.log.info(pc.dim("Download cancelado."));
      return;
    }

    const totalSteps = conversion ? 2 : 1;
    p.log.step(pc.cyan(`[1/${totalSteps}]`) + " Baixando...");

    const outputPath = await this.executeDownload(task);

    if (conversion && outputPath) {
      p.log.step(pc.cyan(`[2/${totalSteps}]`) + " Convertendo...");

      const ext = conversion.extractAudio ?? conversion.outputFormat;
      const convertedPath = outputPath.replace(
        /\.[^.]+$/,
        `.converted.${ext}`,
      );
      await this.deps.convertMedia.execute(
        outputPath,
        convertedPath,
        conversion,
      );
    }

    console.log();
    p.log.success(pc.green(pc.bold("Pronto!")) + pc.dim(` Salvo em ${task.outputDir}`));
  }

  private async buildTaskFromAction(
    action: ActionChoice,
    videoInfo: VideoInfo,
  ): Promise<{ task: DownloadTask; conversion: ConversionTask | null }> {
    const defaults = getSmartDefaults(videoInfo);
    const isLive =
      videoInfo.type === VideoType.Live ||
      videoInfo.type === VideoType.PostLiveDvr;

    let quality = defaults.quality;
    let liveMode = defaults.liveMode;
    let outputDir = defaults.outputDir;
    let concurrency = defaults.concurrency;
    let rateLimit: string | null = null;
    let maxDuration: number | null = null;
    let retries = defaults.retries;
    let timeout = defaults.timeout;

    if (action === "quality") {
      quality = await promptQuality(videoInfo.qualities);
      if (isLive) {
        liveMode = await promptLiveMode();
      }
    } else if (action === "customize") {
      const custom = await promptCustomize(videoInfo);
      quality = custom.quality;
      liveMode = custom.liveMode;
      outputDir = custom.outputDir;
      concurrency = custom.concurrency;
      rateLimit = custom.rateLimit;
      maxDuration = custom.maxDuration;
      retries = custom.retries;
      timeout = custom.timeout;
    }

    let conversion: ConversionTask | null = null;
    const ffmpegOk = isFfmpegAvailable();

    if (ffmpegOk) {
      conversion = await promptConversion();
    } else {
      p.log.info(
        pc.dim(
          "Conversão não disponível — instala o ffmpeg pra ter essa opção.",
        ),
      );
    }

    const task: DownloadTask = {
      videoInfo,
      outputDir,
      filenamePattern: defaults.filenamePattern,
      overwrite: defaults.overwrite,
      concurrency,
      maxDurationSeconds: maxDuration,
      rateLimitBytesPerSecond: rateLimit
        ? new Bitrate(rateLimit).bitsPerSecond / 8
        : null,
      retries,
      timeoutSeconds: timeout,
      liveMode,
      qualityLabel: quality,
      conversion,
    };

    return { task, conversion };
  }

  private async runNonInteractive(args: ParsedArgs): Promise<void> {
    if (!args.url) {
      console.log();
      console.error(
        pc.red("  Precisa informar a URL com --url <link>"),
      );
      console.log(
        pc.dim("  Ou execute sem argumentos para o modo interativo."),
      );
      console.log();
      process.exit(1);
    }

    console.log();
    console.log(pc.dim("  Buscando informações do vídeo..."));

    const videoInfo = await this.deps.resolveVideoInfo.execute(args.url);
    renderVideoCard(videoInfo);

    if (args.infoOnly) {
      renderVideoDetails(videoInfo);
      return;
    }

    let conversion: ConversionTask | null = null;
    if (args.convert) {
      conversion = {
        outputFormat: args.format,
        extractAudio: args.extractAudio,
        videoCodec: args.videoCodec,
        audioCodec: args.audioCodec,
        videoBitrate: args.videoBitrate ? new Bitrate(args.videoBitrate) : null,
        audioBitrate: args.audioBitrate ? new Bitrate(args.audioBitrate) : null,
        resolution: args.resolution,
        fps: args.fps,
        timeRange: new TimeRange(args.trimStart, args.trimEnd),
        noAudio: args.noAudio,
        noVideo: args.noVideo,
      };
    }

    const task: DownloadTask = {
      videoInfo,
      outputDir: args.outputDir,
      filenamePattern: args.filenamePattern,
      overwrite: args.overwrite,
      concurrency: args.concurrency,
      maxDurationSeconds: args.maxDuration,
      rateLimitBytesPerSecond: args.rateLimit
        ? new Bitrate(args.rateLimit).bitsPerSecond / 8
        : null,
      retries: args.retries,
      timeoutSeconds: args.timeout,
      liveMode: args.liveMode,
      qualityLabel: args.quality ?? "best",
      conversion,
    };

    const outputPath = await this.executeDownload(task);

    if (conversion && outputPath) {
      const ext = conversion.extractAudio ?? conversion.outputFormat;
      const convertedPath = outputPath.replace(
        /\.[^.]+$/,
        `.converted.${ext}`,
      );
      await this.deps.convertMedia.execute(
        outputPath,
        convertedPath,
        conversion,
      );
    }

    console.log();
    console.log(pc.green(pc.bold("  Pronto!")));
    console.log();
  }

  private async executeDownload(task: DownloadTask): Promise<string> {
    if (
      task.videoInfo.type === VideoType.Live ||
      task.videoInfo.type === VideoType.PostLiveDvr
    ) {
      return this.deps.downloadLive.execute(task);
    }
    return this.deps.downloadVideo.execute(task);
  }
}
