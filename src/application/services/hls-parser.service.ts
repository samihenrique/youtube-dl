import { QualityOption } from "../../domain/value-objects/quality-option.ts";

export interface HlsVariant {
  readonly bandwidth: number;
  readonly url: string;
  readonly resolution: { width: number; height: number } | null;
}

export class HlsParserService {
  parseVariants(masterManifest: string): HlsVariant[] {
    const lines = masterManifest
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const variants: HlsVariant[] = [];

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!;
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

      const url = lines[i + 1];
      if (!url?.startsWith("http")) continue;

      const bandwidthMatch = /BANDWIDTH=(\d+)/.exec(line);
      const resolutionMatch = /RESOLUTION=(\d+)x(\d+)/.exec(line);

      const resolution = resolutionMatch
        ? { width: Number(resolutionMatch[1]), height: Number(resolutionMatch[2]) }
        : null;

      variants.push({
        bandwidth: bandwidthMatch ? Number(bandwidthMatch[1]) : 0,
        url,
        resolution,
      });
    }

    return variants.sort((a, b) => b.bandwidth - a.bandwidth);
  }

  parseSegmentUrls(variantManifest: string): string[] {
    return variantManifest
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("http"));
  }

  extractSqFromUrl(segmentUrl: string): number {
    const match = /\/sq\/(\d+)\//.exec(segmentUrl);
    if (!match) {
      throw new Error(
        "Não foi possível identificar o índice de segmento (sq) na URL do segmento.",
      );
    }
    return Number(match[1]);
  }

  buildSegmentUrl(templateUrl: string, sq: number): string {
    return templateUrl.replace(/\/sq\/\d+\//, `/sq/${sq}/`);
  }

  variantsToQualityOptions(variants: HlsVariant[]): QualityOption[] {
    return variants.map((v) => {
      const height = v.resolution?.height ?? null;
      const label = height ? `${height}p` : `${Math.round(v.bandwidth / 1000)}kbps`;
      return new QualityOption(
        label,
        v.bandwidth,
        v.url,
        v.resolution?.width ?? null,
        height,
      );
    });
  }
}
