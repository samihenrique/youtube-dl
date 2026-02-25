import { InvalidInputError } from "../errors/invalid-input.error.ts";

const BITRATE_REGEX = /^(\d+(?:\.\d+)?)\s*(k|m)$/i;

export class Bitrate {
  readonly value: string;
  readonly bitsPerSecond: number;

  constructor(raw: string) {
    const trimmed = raw.trim();
    const match = BITRATE_REGEX.exec(trimmed);

    if (!match) {
      throw new InvalidInputError(
        "Bitrate",
        `"${trimmed}" não é um bitrate válido. Use formato como "5M", "192k" ou "2500K"`,
      );
    }

    const num = Number(match[1]);
    const unit = match[2]!.toLowerCase();

    if (num <= 0 || !Number.isFinite(num)) {
      throw new InvalidInputError("Bitrate", "O valor deve ser maior que zero");
    }

    this.bitsPerSecond = unit === "m" ? num * 1_000_000 : num * 1_000;
    this.value = trimmed.toLowerCase();
  }

  toFfmpegArg(): string {
    return this.value;
  }
}
