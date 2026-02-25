export const AudioCodec = {
  Copy: "copy",
  Aac: "aac",
  Opus: "opus",
  Mp3: "mp3",
  Flac: "flac",
} as const;

export type AudioCodec = (typeof AudioCodec)[keyof typeof AudioCodec];
