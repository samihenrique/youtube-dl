import type { AudioCodec } from "../enums/audio-codec.ts";
import type { AudioFormat } from "../enums/audio-format.ts";
import type { EncodingPreset } from "../enums/encoding-preset.ts";
import type { HardwareAccel } from "../enums/hardware-accel.ts";
import type { OutputFormat } from "../enums/output-format.ts";
import type { VideoCodec } from "../enums/video-codec.ts";
import type { Bitrate } from "../value-objects/bitrate.ts";
import type { TimeRange } from "../value-objects/time-range.ts";

export interface ConversionTask {
  readonly outputFormat: OutputFormat;
  readonly extractAudio: AudioFormat | null;
  readonly videoCodec: VideoCodec;
  readonly audioCodec: AudioCodec;
  readonly videoBitrate: Bitrate | null;
  readonly audioBitrate: Bitrate | null;
  readonly resolution: string | null;
  readonly fps: number | null;
  readonly timeRange: TimeRange;
  readonly noAudio: boolean;
  readonly noVideo: boolean;
  readonly hardwareAccel: HardwareAccel;
  readonly threads: number | null;
  readonly preset: EncodingPreset;
  readonly crf: number | null;
}
