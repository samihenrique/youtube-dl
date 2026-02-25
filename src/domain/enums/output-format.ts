export const OutputFormat = {
  Mp4: "mp4",
  Mkv: "mkv",
  Webm: "webm",
  Avi: "avi",
  Mov: "mov",
} as const;

export type OutputFormat = (typeof OutputFormat)[keyof typeof OutputFormat];
