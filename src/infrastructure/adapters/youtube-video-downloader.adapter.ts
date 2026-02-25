import { createWriteStream } from "node:fs";
import type { VideoDownloader } from "../../domain/ports/video-downloader.port.ts";
import { DownloadProgress } from "../../domain/value-objects/download-progress.ts";
import { Innertube, Log, UniversalCache, Utils } from "youtubei.js";

export class YoutubeVideoDownloaderAdapter implements VideoDownloader {
  private yt: Innertube | null = null;

  private async getClient(): Promise<Innertube> {
    if (!this.yt) {
      Log.setLevel(Log.Level.ERROR);
      this.yt = await Innertube.create({ cache: new UniversalCache(false) });
    }
    return this.yt;
  }

  async download(
    videoId: string,
    outputPath: string,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const yt = await this.getClient();
    const stream = await yt.download(videoId, {
      type: "video+audio",
      quality: "best",
      format: "mp4",
    });

    const file = createWriteStream(outputPath);
    let downloadedBytes = 0;
    const startedAt = Date.now();

    for await (const chunk of Utils.streamToIterable(stream)) {
      downloadedBytes += chunk.byteLength;
      file.write(chunk);

      onProgress(
        new DownloadProgress(downloadedBytes, null, Date.now() - startedAt),
      );
    }

    await new Promise<void>((resolve, reject) => {
      file.once("error", reject);
      file.end(() => resolve());
    });
  }
}
