export const OverwriteBehavior = {
  Overwrite: "overwrite",
  Skip: "skip",
  Rename: "rename",
} as const;

export type OverwriteBehavior =
  (typeof OverwriteBehavior)[keyof typeof OverwriteBehavior];
