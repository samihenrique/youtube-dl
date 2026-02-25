import { describe, expect, test } from "bun:test";
import { formatBytes, formatDuration, formatSpeed } from "./format.ts";

describe("formatBytes", () => {
  test("0 bytes", () => expect(formatBytes(0)).toBe("0 B"));
  test("negativo", () => expect(formatBytes(-1)).toBe("0 B"));
  test("NaN", () => expect(formatBytes(NaN)).toBe("0 B"));
  test("Infinity", () => expect(formatBytes(Infinity)).toBe("0 B"));
  test("500 bytes", () => expect(formatBytes(500)).toBe("500 B"));
  test("1 KB", () => expect(formatBytes(1024)).toBe("1.00 KB"));
  test("1.5 KB", () => expect(formatBytes(1536)).toBe("1.50 KB"));
  test("1 MB", () => expect(formatBytes(1024 * 1024)).toBe("1.00 MB"));
  test("1 GB", () => expect(formatBytes(1024 ** 3)).toBe("1.00 GB"));
  test("100 MB omite decimais", () =>
    expect(formatBytes(100 * 1024 * 1024)).toBe("100 MB"));
  test("15 MB usa 1 decimal", () =>
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.0 MB"));
});

describe("formatDuration", () => {
  test("0 segundos", () => expect(formatDuration(0)).toBe("00:00:00"));
  test("negativo", () => expect(formatDuration(-5)).toBe("00:00:00"));
  test("NaN", () => expect(formatDuration(NaN)).toBe("00:00:00"));
  test("90 segundos = 1:30", () => expect(formatDuration(90)).toBe("00:01:30"));
  test("3661 segundos = 1:01:01", () =>
    expect(formatDuration(3661)).toBe("01:01:01"));
  test("decimal é truncado", () =>
    expect(formatDuration(90.7)).toBe("00:01:30"));
});

describe("formatSpeed", () => {
  test("formata velocidade com /s", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1.00 MB/s");
  });
});
