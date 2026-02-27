export const EncodingPreset = {
  Ultrafast: "ultrafast",
  Fast: "fast",
  Medium: "medium",
  Slow: "slow",
} as const;

export type EncodingPreset = (typeof EncodingPreset)[keyof typeof EncodingPreset];
