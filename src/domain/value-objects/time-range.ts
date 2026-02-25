import { InvalidInputError } from "../errors/invalid-input.error.ts";

const TIMECODE_REGEX = /^(\d{1,2}):(\d{2}):(\d{2})$/;

function parseTimecode(raw: string, field: string): number {
  const trimmed = raw.trim();
  const match = TIMECODE_REGEX.exec(trimmed);

  if (!match) {
    throw new InvalidInputError(
      field,
      `"${trimmed}" não é um timecode válido. Use o formato HH:MM:SS`,
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (minutes > 59) {
    throw new InvalidInputError(field, "Minutos devem ser entre 00 e 59");
  }
  if (seconds > 59) {
    throw new InvalidInputError(field, "Segundos devem ser entre 00 e 59");
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export class TimeRange {
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;

  constructor(start: string | null, end: string | null) {
    this.startSeconds = start ? parseTimecode(start, "Trim início") : null;
    this.endSeconds = end ? parseTimecode(end, "Trim fim") : null;

    if (
      this.startSeconds !== null &&
      this.endSeconds !== null &&
      this.startSeconds >= this.endSeconds
    ) {
      throw new InvalidInputError(
        "Time Range",
        "O tempo de início deve ser menor que o tempo de fim",
      );
    }
  }

  get isEmpty(): boolean {
    return this.startSeconds === null && this.endSeconds === null;
  }

  toFfmpegArgs(): string[] {
    const args: string[] = [];
    if (this.startSeconds !== null) {
      args.push("-ss", String(this.startSeconds));
    }
    if (this.endSeconds !== null) {
      if (this.startSeconds !== null) {
        args.push("-t", String(this.endSeconds - this.startSeconds));
      } else {
        args.push("-t", String(this.endSeconds));
      }
    }
    return args;
  }
}
