export const VideoType = {
  Live: "live",
  PostLiveDvr: "post-live-dvr",
  Video: "video",
} as const;

export type VideoType = (typeof VideoType)[keyof typeof VideoType];
