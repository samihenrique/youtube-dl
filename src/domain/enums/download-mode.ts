export const DownloadMode = {
  DvrStart: "dvr-start",
  LiveNow: "live-now",
} as const;

export type DownloadMode = (typeof DownloadMode)[keyof typeof DownloadMode];
