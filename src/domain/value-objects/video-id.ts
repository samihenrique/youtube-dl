import { InvalidInputError } from "../errors/invalid-input.error.ts";

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{8,}$/;

export class VideoId {
  readonly value: string;

  constructor(raw: string) {
    const trimmed = raw.trim();
    if (!VIDEO_ID_REGEX.test(trimmed)) {
      throw new InvalidInputError(
        "Video ID",
        `"${trimmed}" não é um ID válido do YouTube (mínimo 8 caracteres alfanuméricos)`,
      );
    }
    this.value = trimmed;
  }
}
