export function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
