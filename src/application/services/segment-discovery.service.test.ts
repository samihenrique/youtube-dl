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
    const firstAvailable = latestSq - 17280 + 1;
    const service = createService(firstAvailable);

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
      undefined,
      17280,
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
      undefined,
      34560,
    );
    expect(earliest).toBe(firstAvailable);
  });

  test("respeita maxLookbackSegments e não procura além do limite", async () => {
    let probeCount = 0;
    const latestSq = 100000;
    const service = new SegmentDiscoveryService(
      async (url) => {
        probeCount++;
        const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
        return sq >= 1;
      },
      (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
    );

    const maxLookback = 8640; // 12h
    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
      undefined,
      maxLookback,
    );

    expect(earliest).toBe(latestSq - maxLookback);
    expect(probeCount).toBeLessThan(30);
  });

  test("encontra segmento real dentro do limite de lookback", async () => {
    const latestSq = 100000;
    const firstAvailable = latestSq - 5000 + 1;
    const service = createService(firstAvailable);

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
      undefined,
      8640,
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

    expect(probeCount).toBeLessThan(50);
    expect(probeCount).toBeGreaterThan(0);
  });

  test("renova template quando checker lança (simula 403 auth expired)", async () => {
    const latestSq = 20000;
    const firstAvailable = latestSq - 8640 + 1;
    const authValidRange = 4096;
    let refreshCount = 0;

    const service = new SegmentDiscoveryService(
      async (url) => {
        const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
        if (sq < firstAvailable) return false;
        const hasNewToken = url.includes("fresh-token");
        const distFromLatest = latestSq - sq;
        if (!hasNewToken && distFromLatest > authValidRange) {
          throw new Error("HTTP 403");
        }
        return true;
      },
      (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
    );

    const refreshTemplate = async (): Promise<string> => {
      refreshCount++;
      return "https://example.com/sq/1/fresh-token/chunk.ts";
    };

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
      refreshTemplate,
    );

    expect(earliest).toBe(firstAvailable);
    expect(refreshCount).toBeGreaterThan(0);
  });

  test("sem refreshTemplate, trata throws como false", async () => {
    const latestSq = 10000;

    const service = new SegmentDiscoveryService(
      async (url) => {
        const sq = Number(url.match(/sq\/(\d+)/)?.[1]);
        if (latestSq - sq > 2048) throw new Error("HTTP 403");
        return sq >= latestSq - 5000;
      },
      (template, sq) => template.replace(/sq\/\d+/, `sq/${sq}`),
    );

    const earliest = await service.findEarliestAvailableSq(
      "https://example.com/sq/1/chunk.ts",
      latestSq,
    );

    expect(earliest).toBeGreaterThan(latestSq - 5000);
    expect(earliest).toBeLessThanOrEqual(latestSq);
  });
});
