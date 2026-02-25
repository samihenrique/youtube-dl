const DEFAULT_MAX_LOOKBACK_SEGMENTS = 8_640; // 12h × 720 seg/h

export type DiscoveryLogger = (message: string) => void;

export class SegmentDiscoveryService {
  constructor(
    private readonly checkExists: (url: string) => Promise<boolean>,
    private readonly buildUrl: (template: string, sq: number) => string,
    private readonly log: DiscoveryLogger = () => {},
  ) {}

  async findEarliestAvailableSq(
    segmentTemplateUrl: string,
    latestSq: number,
    refreshTemplate?: () => Promise<string>,
    maxLookbackSegments: number = DEFAULT_MAX_LOOKBACK_SEGMENTS,
  ): Promise<number> {
    let currentTemplate = segmentTemplateUrl;
    let lowerBound = latestSq;
    let step = 1;
    let templateIsFresh = false;

    const absoluteMin = Math.max(1, latestSq - maxLookbackSegments);

    while (true) {
      const candidate = latestSq - step;

      if (candidate <= absoluteMin) {
        lowerBound = absoluteMin;
        break;
      }

      const estimatedHours = ((step * 5) / 3600).toFixed(1);
      this.log(`Verificando ~${estimatedHours}h atrás...`);

      const exists = await this.probeWithRefresh(
        currentTemplate,
        candidate,
        templateIsFresh ? undefined : refreshTemplate,
        (freshTemplate) => {
          currentTemplate = freshTemplate;
          templateIsFresh = true;
        },
      );

      if (!exists) {
        lowerBound = candidate + 1;
        break;
      }

      step *= 2;
    }

    let left = Math.max(absoluteMin, lowerBound);
    let right = latestSq;

    this.log("Refinando ponto inicial...");

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const exists = await this.probeWithRefresh(
        currentTemplate,
        mid,
        templateIsFresh ? undefined : refreshTemplate,
        (freshTemplate) => {
          currentTemplate = freshTemplate;
          templateIsFresh = true;
        },
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
    this.log(
      `Encontrado: ${totalSegments} segmentos (~${hours}h${String(minutes).padStart(2, "0")}m disponíveis)`,
    );

    return left;
  }

  private async probeWithRefresh(
    template: string,
    sq: number,
    refreshTemplate: (() => Promise<string>) | undefined,
    onRefresh: (freshTemplate: string) => void,
  ): Promise<boolean> {
    try {
      return await this.checkExists(this.buildUrl(template, sq));
    } catch {
      if (!refreshTemplate) {
        return false;
      }

      this.log("Renovando autenticação...");

      const freshTemplate = await refreshTemplate();
      onRefresh(freshTemplate);

      try {
        return await this.checkExists(this.buildUrl(freshTemplate, sq));
      } catch {
        return false;
      }
    }
  }
}
