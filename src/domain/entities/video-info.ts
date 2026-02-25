import type { VideoType } from "../enums/video-type.ts";
import type { QualityOption } from "../value-objects/quality-option.ts";

export interface VideoInfo {
  readonly id: string;
  readonly title: string;
  readonly type: VideoType;
  readonly durationSeconds: number | null;
  readonly hlsManifestUrl: string | null;
  readonly qualities: readonly QualityOption[];
}
