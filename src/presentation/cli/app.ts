import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import type { DownloadTask } from "../../domain/entities/download-task.ts";
import type { VideoInfo } from "../../domain/entities/video-info.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { DomainError } from "../../domain/errors/domain-error.ts";
import { Bitrate } from "../../domain/value-objects/bitrate.ts";
import { TimeRange } from "../../domain/value-objects/time-range.ts";
import type { ConvertMediaUseCase } from "../../application/use-cases/convert-media.use-case.ts";
import type { DownloadLiveUseCase } from "../../application/use-cases/download-live.use-case.ts";
import type { DownloadVideoUseCase } from "../../application/use-cases/download-video.use-case.ts";
import type { ResolveVideoInfoUseCase } from "../../application/use-cases/resolve-video-info.use-case.ts";
import { formatDuration } from "../../infrastructure/helpers/format.ts";
import type { ParsedArgs } from "./args.ts";
import { promptUrl } from "./prompts/url.prompt.ts";
import { promptDownloadOptions } from "./prompts/download-options.prompt.ts";
import { promptOutputOptions } from "./prompts/output-options.prompt.ts";
import {
  promptShouldConvert,
  promptConversionOptions,
} from "./prompts/conversion-options.prompt.ts";

export interface AppDependencies {
  resolveVideoInfo: ResolveVideoInfoUseCase;
  downloadVideo: DownloadVideoUseCase;
  downloadLive: DownloadLiveUseCase;
  convertMedia: ConvertMediaUseCase;
}

export class CliApp {
  constructor(private readonly deps: AppDependencies) {}

  async run(args: ParsedArgs): Promise<void> {
    this.printBanner();

    try {
      if (args.interactive) {
        await this.runInteractive();
      } else {
        await this.runNonInteractive(args);
      }
    } catch (error: unknown) {
      this.handleError(error);
      process.exit(1);
    }
  }

  private printBanner(): void {
    console.log();
    console.log(
      pc.bold(pc.cyan("  rush-dl")) +
        pc.dim(" — YouTube downloader ultra-rápido"),
    );
    console.log();
  }

  private async runInteractive(): Promise<void> {
    p.intro(pc.bgCyan(pc.black(" rush-dl ")));

    let continueLoop = true;
    while (continueLoop) {
      await this.runInteractiveSession();

      const again = await p.confirm({
        message: "Baixar outro vídeo?",
        initialValue: false,
      });

      if (p.isCancel(again) || !again) {
        continueLoop = false;
      } else {
        console.log();
      }
    }

    p.outro(pc.green("Até a próxima!"));
  }

  private async runInteractiveSession(): Promise<void> {
    const url = await promptUrl();

    const spinner = p.spinner();
    spinner.start("Resolvendo informações do vídeo...");

    let videoInfo: VideoInfo;
    try {
      videoInfo = await this.deps.resolveVideoInfo.execute(url);
      spinner.stop(this.formatVideoSummary(videoInfo));
    } catch (error: unknown) {
      spinner.stop("Falha ao resolver vídeo");
      throw error;
    }

    const infoOnly = await this.promptInfoOnly();
    if (infoOnly) {
      this.printVideoDetails(videoInfo);
      return;
    }

    const downloadOpts = await promptDownloadOptions(
      videoInfo.type,
      videoInfo.qualities,
    );
    const outputOpts = await promptOutputOptions();
    const shouldConvert = await promptShouldConvert();
    let conversion: ConversionTask | null = null;
    if (shouldConvert) {
      conversion = await promptConversionOptions();
    }

    const task: DownloadTask = {
      videoInfo,
      outputDir: outputOpts.outputDir,
      filenamePattern: outputOpts.filenamePattern,
      overwrite: outputOpts.overwrite,
      concurrency: downloadOpts.concurrency,
      maxDurationSeconds: downloadOpts.maxDuration,
      rateLimitBytesPerSecond: downloadOpts.rateLimit
        ? new Bitrate(downloadOpts.rateLimit).bitsPerSecond / 8
        : null,
      retries: downloadOpts.retries,
      timeoutSeconds: downloadOpts.timeout,
      liveMode: downloadOpts.liveMode,
      qualityLabel: downloadOpts.quality,
      conversion,
    };

    const outputPath = await this.executeDownload(task);

    if (conversion && outputPath) {
      const ext = conversion.extractAudio ?? conversion.outputFormat;
      const convertedPath = outputPath.replace(/\.[^.]+$/, `.converted.${ext}`);
      await this.deps.convertMedia.execute(outputPath, convertedPath, conversion);
    }

    p.log.success(pc.green("Download concluído!"));
  }

  private async runNonInteractive(args: ParsedArgs): Promise<void> {
    if (!args.url) {
      console.error(
        pc.red("Erro: --url é obrigatório no modo não-interativo."),
      );
      console.log(
        pc.dim("Execute sem argumentos para o modo interativo, ou use --url <url>"),
      );
      process.exit(1);
    }

    const videoInfo = await this.deps.resolveVideoInfo.execute(args.url);
    console.log(this.formatVideoSummary(videoInfo));

    if (args.infoOnly) {
      this.printVideoDetails(videoInfo);
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
      const convertedPath = outputPath.replace(/\.[^.]+$/, `.converted.${ext}`);
      await this.deps.convertMedia.execute(outputPath, convertedPath, conversion);
    }
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

  private async promptInfoOnly(): Promise<boolean> {
    const result = await p.confirm({
      message: "Apenas visualizar informações (sem baixar)?",
      initialValue: false,
    });

    if (p.isCancel(result)) {
      p.cancel("Operação cancelada.");
      process.exit(0);
    }
    return result;
  }

  private formatVideoSummary(info: VideoInfo): string {
    const typeLabel =
      info.type === VideoType.Live
        ? pc.red("● LIVE")
        : info.type === VideoType.PostLiveDvr
          ? pc.yellow("◉ DVR")
          : pc.green("▶ Vídeo");

    const duration = info.durationSeconds
      ? pc.dim(` (${formatDuration(info.durationSeconds)})`)
      : "";

    return `${typeLabel} ${pc.bold(info.title)}${duration}`;
  }

  private printVideoDetails(info: VideoInfo): void {
    console.log();
    console.log(pc.bold("  Detalhes do vídeo:"));
    console.log(`  ${pc.dim("ID:")}        ${info.id}`);
    console.log(`  ${pc.dim("Título:")}    ${info.title}`);
    console.log(`  ${pc.dim("Tipo:")}      ${info.type}`);
    if (info.durationSeconds) {
      console.log(
        `  ${pc.dim("Duração:")}   ${formatDuration(info.durationSeconds)}`,
      );
    }
    if (info.qualities.length > 0) {
      console.log(`  ${pc.dim("Qualidades:")} ${info.qualities.map((q) => q.label).join(", ")}`);
    }
    console.log();
  }

  private handleError(error: unknown): void {
    console.log();
    if (error instanceof DomainError) {
      console.error(pc.red(`✖ [${error.code}] ${error.message}`));
      if (error.cause) {
        const causeMsg =
          error.cause instanceof Error
            ? error.cause.message
            : String(error.cause);
        console.error(pc.dim(`  Causa: ${causeMsg}`));
      }
    } else if (error instanceof Error) {
      console.error(pc.red(`✖ ${error.message}`));
    } else {
      console.error(pc.red(`✖ Erro inesperado: ${String(error)}`));
    }
  }
}
