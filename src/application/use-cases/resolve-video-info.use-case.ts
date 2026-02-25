import type { VideoInfo } from "../../domain/entities/video-info.ts";
import { VideoUnavailableError } from "../../domain/errors/video-unavailable.error.ts";
import type { VideoInfoProvider } from "../../domain/ports/video-info-provider.port.ts";
import { VideoUrl } from "../../domain/value-objects/video-url.ts";

export class ResolveVideoInfoUseCase {
  constructor(private readonly provider: VideoInfoProvider) {}

  async execute(rawUrl: string): Promise<VideoInfo> {
    const url = new VideoUrl(rawUrl);

    try {
      return await this.provider.resolve(url.videoId);
    } catch (error: unknown) {
      throw new VideoUnavailableError(url.videoId, { cause: error });
    }
  }
}
