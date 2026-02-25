import { InvalidUrlError } from "../errors/invalid-url.error.ts";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const ID_PATH_PREFIXES = new Set(["live", "shorts", "embed", "v"]);

export class VideoUrl {
  readonly value: string;
  readonly videoId: string;

  constructor(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new InvalidUrlError(raw);
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new InvalidUrlError(trimmed);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new InvalidUrlError(trimmed);
    }

    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      throw new InvalidUrlError(trimmed);
    }

    const id = VideoUrl.extractId(parsed, host);
    if (!id || id.length < 8) {
      throw new InvalidUrlError(trimmed);
    }

    this.value = trimmed;
    this.videoId = id;
  }

  private static extractId(parsed: URL, host: string): string | null {
    if (host === "youtu.be" || host === "www.youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v");
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const prefix = parts[0]!;
      const id = parts[1]!;
      if (ID_PATH_PREFIXES.has(prefix)) {
        return id;
      }
    }

    return null;
  }
}
