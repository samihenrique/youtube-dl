import type { VideoInfo } from "../entities/video-info.ts";

export interface VideoInfoProvider {
  resolve(videoId: string): Promise<VideoInfo>;
}
