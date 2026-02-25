export const FilenamePattern = {
  TitleId: "title-id",
  IdTitle: "id-title",
  TitleOnly: "title",
} as const;

export type FilenamePattern =
  (typeof FilenamePattern)[keyof typeof FilenamePattern];
