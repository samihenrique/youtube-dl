export const VideoCodec = {
  Copy: "copy",
  H264: "h264",
  H265: "h265",
  Vp9: "vp9",
  Av1: "av1",
} as const;

export type VideoCodec = (typeof VideoCodec)[keyof typeof VideoCodec];
