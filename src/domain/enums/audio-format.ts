export const AudioFormat = {
  Mp3: "mp3",
  Aac: "aac",
  Opus: "opus",
  Flac: "flac",
  Wav: "wav",
  Ogg: "ogg",
} as const;

export type AudioFormat = (typeof AudioFormat)[keyof typeof AudioFormat];
