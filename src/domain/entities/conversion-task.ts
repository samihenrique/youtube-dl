import type { AudioCodec } from "../enums/audio-codec.ts";
import type { EncodingPreset } from "../enums/encoding-preset.ts";
import type { HardwareAccel } from "../enums/hardware-accel.ts";
import type { OutputFormat } from "../enums/output-format.ts";
import type { VideoCodec } from "../enums/video-codec.ts";
import type { Bitrate } from "../value-objects/bitrate.ts";

export interface ConversionTask {
  readonly outputFormat: OutputFormat;
  readonly videoCodec: VideoCodec;
  readonly audioCodec: AudioCodec;
  readonly videoBitrate: Bitrate | null;
  readonly audioBitrate: Bitrate | null;
  readonly resolution: string | null;
  readonly fps: number | null;
  readonly noAudio: boolean;
  readonly hardwareAccel: HardwareAccel;
  readonly threads: number | null;
  readonly preset: EncodingPreset;
  readonly crf: number | null;
}
