import type { VideoType } from "../enums/video-type.ts";
import type { QualityOption } from "../value-objects/quality-option.ts";

export interface DashFormat {
  readonly itag: number;
  readonly url: string;
  readonly mimeType: string;
  readonly qualityLabel: string | null;
  readonly bitrate: number;
  readonly width: number | null;
  readonly height: number | null;
}

export interface VideoInfo {
  readonly id: string;
  readonly title: string;
  readonly type: VideoType;
  readonly durationSeconds: number | null;
  readonly hlsManifestUrl: string | null;
  readonly qualities: readonly QualityOption[];
  readonly dashFormats: readonly DashFormat[];
}
