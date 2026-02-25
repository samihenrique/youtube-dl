export class DownloadProgress {
  constructor(
    readonly downloadedBytes: number,
    readonly totalBytes: number | null,
    readonly elapsedMs: number,
    readonly downloadedSegments: number = 0,
    readonly totalSegments: number | null = null,
  ) {}

  get speedBytesPerSecond(): number {
    const elapsedSeconds = Math.max(1, this.elapsedMs / 1000);
    return this.downloadedBytes / elapsedSeconds;
  }

  get percent(): number | null {
    if (this.totalSegments !== null && this.totalSegments > 0) {
      return Math.min(100, (this.downloadedSegments / this.totalSegments) * 100);
    }
    if (this.totalBytes !== null && this.totalBytes > 0) {
      return Math.min(100, (this.downloadedBytes / this.totalBytes) * 100);
    }
    return null;
  }

  get etaMs(): number | null {
    const pct = this.percent;
    if (pct === null || pct <= 0) return null;
    const elapsed = this.elapsedMs;
    const total = (elapsed / pct) * 100;
    return Math.max(0, total - elapsed);
  }
}
