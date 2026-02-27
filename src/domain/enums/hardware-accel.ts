export const HardwareAccel = {
  None: "none",
  Auto: "auto",
  Nvenc: "nvenc",
  Qsv: "qsv",
  Vaapi: "vaapi",
  Videotoolbox: "videotoolbox",
} as const;

export type HardwareAccel = (typeof HardwareAccel)[keyof typeof HardwareAccel];
