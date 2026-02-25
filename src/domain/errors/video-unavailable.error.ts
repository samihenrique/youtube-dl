import { DomainError } from "./domain-error.ts";

export class VideoUnavailableError extends DomainError {
  readonly code = "VIDEO_UNAVAILABLE";

  constructor(videoId: string, options?: ErrorOptions) {
    super(
      `O vídeo "${videoId}" não está disponível. ` +
        `Verifique se a URL está correta e se o vídeo é público.`,
      options,
    );
  }
}
