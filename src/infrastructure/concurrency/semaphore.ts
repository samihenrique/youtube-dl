export class Semaphore {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {
    if (maxConcurrency < 1 || !Number.isInteger(maxConcurrency)) {
      throw new RangeError(
        `Concurrency must be a positive integer, got ${maxConcurrency}`,
      );
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.running;
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}
