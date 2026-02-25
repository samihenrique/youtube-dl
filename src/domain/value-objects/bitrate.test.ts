import { describe, expect, test } from "bun:test";
import { Bitrate } from "./bitrate.ts";
import { InvalidInputError } from "../errors/invalid-input.error.ts";

describe("Bitrate", () => {
  describe("formatos válidos", () => {
    test("5M", () => {
      const b = new Bitrate("5M");
      expect(b.bitsPerSecond).toBe(5_000_000);
      expect(b.value).toBe("5m");
    });

    test("192k", () => {
      const b = new Bitrate("192k");
      expect(b.bitsPerSecond).toBe(192_000);
    });

    test("2500K (maiúsculo)", () => {
      const b = new Bitrate("2500K");
      expect(b.bitsPerSecond).toBe(2_500_000);
    });

    test("10m (minúsculo)", () => {
      const b = new Bitrate("10m");
      expect(b.bitsPerSecond).toBe(10_000_000);
    });

    test("0.5M (decimal)", () => {
      const b = new Bitrate("0.5M");
      expect(b.bitsPerSecond).toBe(500_000);
    });

    test("trim espaços", () => {
      const b = new Bitrate("  5M  ");
      expect(b.bitsPerSecond).toBe(5_000_000);
    });

    test("toFfmpegArg() retorna formato normalizado", () => {
      const b = new Bitrate("5M");
      expect(b.toFfmpegArg()).toBe("5m");
    });
  });

  describe("formatos inválidos", () => {
    test("sem unidade", () => {
      expect(() => new Bitrate("500")).toThrow(InvalidInputError);
    });

    test("string vazia", () => {
      expect(() => new Bitrate("")).toThrow(InvalidInputError);
    });

    test("texto aleatório", () => {
      expect(() => new Bitrate("rapido")).toThrow(InvalidInputError);
    });

    test("unidade errada", () => {
      expect(() => new Bitrate("5G")).toThrow(InvalidInputError);
    });
  });
});
