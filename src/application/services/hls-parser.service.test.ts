import { describe, expect, test } from "bun:test";
import { HlsParserService } from "./hls-parser.service.ts";

const MASTER_MANIFEST = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://example.com/stream/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
https://example.com/stream/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360
https://example.com/stream/360p.m3u8
`;

const VARIANT_MANIFEST = `#EXTM3U
#EXT-X-TARGETDURATION:5
#EXTINF:5.0,
https://example.com/segment/sq/100/chunk.ts
#EXTINF:5.0,
https://example.com/segment/sq/101/chunk.ts
#EXTINF:5.0,
https://example.com/segment/sq/102/chunk.ts
`;

describe("HlsParserService", () => {
  const parser = new HlsParserService();

  describe("parseVariants()", () => {
    test("extrai variantes ordenadas por bandwidth (maior primeiro)", () => {
      const variants = parser.parseVariants(MASTER_MANIFEST);
      expect(variants).toHaveLength(3);
      expect(variants[0]!.bandwidth).toBe(5000000);
      expect(variants[0]!.resolution).toEqual({ width: 1920, height: 1080 });
      expect(variants[1]!.bandwidth).toBe(2500000);
      expect(variants[2]!.bandwidth).toBe(1000000);
    });

    test("retorna array vazio para manifesto inválido", () => {
      const variants = parser.parseVariants("invalid manifest");
      expect(variants).toEqual([]);
    });

    test("ignora linhas que não são URLs", () => {
      const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000
not-a-url
`;
      const variants = parser.parseVariants(manifest);
      expect(variants).toEqual([]);
    });

    test("variante sem RESOLUTION tem resolution null", () => {
      const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000
https://example.com/audio-only.m3u8
`;
      const variants = parser.parseVariants(manifest);
      expect(variants).toHaveLength(1);
      expect(variants[0]!.resolution).toBeNull();
    });
  });

  describe("parseSegmentUrls()", () => {
    test("extrai URLs de segmentos", () => {
      const urls = parser.parseSegmentUrls(VARIANT_MANIFEST);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toContain("sq/100");
      expect(urls[2]).toContain("sq/102");
    });

    test("retorna vazio para manifesto sem URLs", () => {
      const urls = parser.parseSegmentUrls("#EXTM3U\n#EXTINF:5.0,");
      expect(urls).toEqual([]);
    });
  });

  describe("extractSqFromUrl()", () => {
    test("extrai sq de URL de segmento", () => {
      expect(
        parser.extractSqFromUrl("https://example.com/segment/sq/42/chunk.ts"),
      ).toBe(42);
    });

    test("lança erro para URL sem sq", () => {
      expect(() =>
        parser.extractSqFromUrl("https://example.com/no-sq-here"),
      ).toThrow();
    });
  });

  describe("buildSegmentUrl()", () => {
    test("substitui sq no template", () => {
      const url = parser.buildSegmentUrl(
        "https://example.com/segment/sq/100/chunk.ts",
        200,
      );
      expect(url).toBe("https://example.com/segment/sq/200/chunk.ts");
    });
  });

  describe("variantsToQualityOptions()", () => {
    test("converte variantes para QualityOptions", () => {
      const variants = parser.parseVariants(MASTER_MANIFEST);
      const options = parser.variantsToQualityOptions(variants);
      expect(options).toHaveLength(3);
      expect(options[0]!.label).toBe("1080p");
      expect(options[0]!.height).toBe(1080);
    });
  });
});
