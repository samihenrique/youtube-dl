import { DomainError } from "./domain-error.ts";

export class DownloadFailedError extends DomainError {
  readonly code = "DOWNLOAD_FAILED";

  constructor(reason: string, options?: ErrorOptions) {
    super(`Falha no download: ${reason}`, options);
  }
}
