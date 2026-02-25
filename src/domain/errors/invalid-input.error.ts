import { DomainError } from "./domain-error.ts";

export class InvalidInputError extends DomainError {
  readonly code = "INVALID_INPUT";

  constructor(
    readonly field: string,
    readonly constraint: string,
  ) {
    super(`${field}: ${constraint}`);
  }
}
