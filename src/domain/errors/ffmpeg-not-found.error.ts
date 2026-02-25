import { DomainError } from "./domain-error.ts";

export class FfmpegNotFoundError extends DomainError {
  readonly code = "FFMPEG_NOT_FOUND";

  constructor() {
    super(
      "Nenhum binário do ffmpeg foi encontrado. " +
        "Instale o ffmpeg no sistema: https://ffmpeg.org/download.html",
    );
  }
}
