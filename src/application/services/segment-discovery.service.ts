export class SegmentDiscoveryService {
  constructor(
    private readonly checkExists: (url: string) => Promise<boolean>,
    private readonly buildUrl: (template: string, sq: number) => string,
  ) {}

  async findEarliestAvailableSq(
    segmentTemplateUrl: string,
    latestSq: number,
  ): Promise<number> {
    let lowerBound = latestSq;
    let step = 1;

    while (true) {
      const candidate = latestSq - step;

      if (candidate <= 0) {
        lowerBound = 1;
        break;
      }

      const estimatedHours = ((step * 5) / 3600).toFixed(1);
      console.log(
        `[dvr-discovery] Verificando sq ${candidate} (~${estimatedHours}h atrás)...`,
      );

      const exists = await this.checkExists(
        this.buildUrl(segmentTemplateUrl, candidate),
      );

      if (!exists) {
        lowerBound = candidate + 1;
        break;
      }

      step *= 2;
    }

    let left = Math.max(1, lowerBound);
    let right = latestSq;

    console.log(
      `[dvr-discovery] Refinando entre sq ${left}..${right} (busca binária)...`,
    );

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const exists = await this.checkExists(
        this.buildUrl(segmentTemplateUrl, mid),
      );
      if (exists) {
        right = mid;
      } else {
        left = mid + 1;
      }
    }

    const totalSegments = latestSq - left + 1;
    const hours = Math.floor((totalSegments * 5) / 3600);
    const minutes = Math.floor(((totalSegments * 5) % 3600) / 60);
    console.log(
      `[dvr-discovery] Primeiro segmento encontrado: sq ${left} (${totalSegments} segmentos, ~${hours}h${String(minutes).padStart(2, "0")}m)`,
    );

    return left;
  }
}
