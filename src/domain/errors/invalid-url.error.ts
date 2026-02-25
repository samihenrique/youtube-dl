import { DomainError } from "./domain-error.ts";

export class InvalidUrlError extends DomainError {
  readonly code = "INVALID_URL";

  constructor(url: string) {
    super(
      `A URL "${url}" não é um link válido do YouTube. ` +
        `Use um link no formato: https://youtube.com/watch?v=ID ou https://youtu.be/ID`,
    );
  }
}
