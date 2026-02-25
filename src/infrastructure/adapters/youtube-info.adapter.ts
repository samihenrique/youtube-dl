import type { DashFormat, VideoInfo } from "../../domain/entities/video-info.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import type { VideoInfoProvider } from "../../domain/ports/video-info-provider.port.ts";
import { QualityOption } from "../../domain/value-objects/quality-option.ts";
import { Innertube, Log, UniversalCache } from "youtubei.js";

export class YoutubeInfoAdapter implements VideoInfoProvider {
  private yt: Innertube | null = null;

  private async getClient(): Promise<Innertube> {
    if (!this.yt) {
      Log.setLevel(Log.Level.ERROR);
      this.yt = await Innertube.create({ cache: new UniversalCache(false) });
    }
    return this.yt;
  }

  async resolve(videoId: string): Promise<VideoInfo> {
    const yt = await this.getClient();
    const info = await yt.getInfo(videoId, { client: "ANDROID" });

    const title =
      typeof info.basic_info?.title === "string"
        ? info.basic_info.title
        : `youtube-${videoId}`;

    const type = this.detectType(info.basic_info);
    const hlsManifestUrl = info.streaming_data?.hls_manifest_url ?? null;
    const durationSeconds = info.basic_info?.duration ?? null;

    const qualities = this.extractQualities(info.streaming_data);
    const dashFormats = this.extractDashFormats(info.streaming_data);

    return {
      id: videoId,
      title,
      type,
      durationSeconds,
      hlsManifestUrl,
      qualities,
      dashFormats,
    };
  }

  private detectType(basic: unknown): VideoType {
    if (!basic || typeof basic !== "object") return VideoType.Video;
    const b = basic as Record<string, unknown>;
    if (b["is_live"]) return VideoType.Live;
    if (b["is_post_live_dvr"]) return VideoType.PostLiveDvr;
    if (b["is_live_content"]) return VideoType.Live;
    return VideoType.Video;
  }

  private extractDashFormats(streaming: unknown): DashFormat[] {
    if (!streaming || typeof streaming !== "object") return [];
    const s = streaming as Record<string, unknown>;
    const adaptiveFormats =
      (s["adaptive_formats"] as Array<Record<string, unknown>>) ?? [];

    return adaptiveFormats
      .filter((fmt) => Boolean(fmt["url"]))
      .map((fmt) => ({
        itag: (fmt["itag"] as number) ?? 0,
        url: fmt["url"] as string,
        mimeType: (fmt["mime_type"] as string) ?? (fmt["mimeType"] as string) ?? "",
        qualityLabel: (fmt["quality_label"] as string) ?? (fmt["qualityLabel"] as string) ?? null,
        bitrate: (fmt["bitrate"] as number) ?? 0,
        width: (fmt["width"] as number) ?? null,
        height: (fmt["height"] as number) ?? null,
      }));
  }

  private extractQualities(streaming: unknown): QualityOption[] {
    if (!streaming || typeof streaming !== "object") return [];
    const s = streaming as Record<string, unknown>;

    const formats = [
      ...((s["formats"] as Array<Record<string, unknown>>) ?? []),
      ...((s["adaptive_formats"] as Array<Record<string, unknown>>) ?? []),
    ];

    const seen = new Set<string>();
    const options: QualityOption[] = [];

    for (const fmt of formats) {
      const height = (fmt["height"] as number) ?? null;
      const width = (fmt["width"] as number) ?? null;
      const bitrate = (fmt["bitrate"] as number) ?? 0;
      const url = (fmt["url"] as string) ?? "";
      const hasVideo = Boolean(fmt["width"]);

      if (!hasVideo || !url) continue;

      const label = height ? `${height}p` : `${Math.round(bitrate / 1000)}kbps`;
      if (seen.has(label)) continue;
      seen.add(label);

      options.push(new QualityOption(label, bitrate, url, width, height));
    }

    return options.sort((a, b) => b.bandwidth - a.bandwidth);
  }
}
