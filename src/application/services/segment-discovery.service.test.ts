import { describe, expect, test } from "bun:test";
import { SegmentDiscoveryService } from "./segment-discovery.service.ts";

function createService(firstAvailable: number) {
  return new SegmentDiscoveryService(
    async (url) => {
      const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
      return sq >= firstAvailable;
    },
    (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
  );
}

describe("SegmentDiscoveryService", () => {
  test("encontra o primeiro segmento quando todos existem desde sq 1", async () => {
    const existingSegments = new Set(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );

    const service = new SegmentDiscoveryService(
      async (url) => {
        const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
        return existingSegments.has(sq);
      },
      (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
    );

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      100,
    );
    expect(earliest).toBe(1);
  });

  test("encontra o primeiro segmento quando a janela começa no meio", async () => {
    const service = createService(50);
    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      100,
    );
    expect(earliest).toBe(50);
  });

  test("retorna latestSq quando apenas ele existe", async () => {
    const latestSq = 500;
    const service = new SegmentDiscoveryService(
      async (url) => {
        const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
        return sq === latestSq;
      },
      (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
    );

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
    );
    expect(earliest).toBe(latestSq);
  });

  test("encontra segmento correto para live de 24h (~17280 segmentos)", async () => {
    const latestSq = 20000;
    const firstAvailable = latestSq - 17280 + 1; // ~24h de DVR (5s/seg)
    const service = createService(firstAvailable);

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
    );
    expect(earliest).toBe(firstAvailable);
  });

  test("encontra segmento correto para live de 48h (~34560 segmentos)", async () => {
    const latestSq = 50000;
    const firstAvailable = latestSq - 34560 + 1;
    const service = createService(firstAvailable);

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
    );
    expect(earliest).toBe(firstAvailable);
  });

  test("não tem limite de lookback — encontra segmento para 100h+", async () => {
    const latestSq = 100000;
    const firstAvailable = latestSq - 72000 + 1; // ~100h
    const service = createService(firstAvailable);

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
    );
    expect(earliest).toBe(firstAvailable);
  });

  test("número mínimo de probes no exponential backtrack", async () => {
    let probeCount = 0;
    const latestSq = 50000;
    const firstAvailable = latestSq - 20000 + 1;

    const service = new SegmentDiscoveryService(
      async (url) => {
        probeCount++;
        const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
        return sq >= firstAvailable;
      },
      (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
    );

    await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
    );

    // exponential phase: ~log2(20000) ≈ 15 probes, binary search: ~15 probes
    // total should be well under 50
    expect(probeCount).toBeLessThan(50);
    expect(probeCount).toBeGreaterThan(0);
  });
});
