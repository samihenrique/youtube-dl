import { DomainError } from "./domain-error.ts";

export class ConversionFailedError extends DomainError {
  readonly code = "CONVERSION_FAILED";

  constructor(reason: string, options?: ErrorOptions) {
    super(`Falha na conversão: ${reason}`, options);
  }
}
