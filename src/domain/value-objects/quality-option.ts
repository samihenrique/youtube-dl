export class QualityOption {
  constructor(
    readonly label: string,
    readonly bandwidth: number,
    readonly url: string,
    readonly width: number | null = null,
    readonly height: number | null = null,
  ) {}

  get resolution(): string {
    if (this.height !== null) return `${this.height}p`;
    return "unknown";
  }
}
