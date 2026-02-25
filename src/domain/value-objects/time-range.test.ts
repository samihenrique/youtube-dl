import { describe, expect, test } from "bun:test";
import { TimeRange } from "./time-range.ts";
import { InvalidInputError } from "../errors/invalid-input.error.ts";

describe("TimeRange", () => {
  describe("timecodes válidos", () => {
    test("início e fim", () => {
      const range = new TimeRange("00:01:00", "00:05:30");
      expect(range.startSeconds).toBe(60);
      expect(range.endSeconds).toBe(330);
      expect(range.isEmpty).toBe(false);
    });

    test("apenas início", () => {
      const range = new TimeRange("01:30:00", null);
      expect(range.startSeconds).toBe(5400);
      expect(range.endSeconds).toBeNull();
    });

    test("apenas fim", () => {
      const range = new TimeRange(null, "00:10:00");
      expect(range.startSeconds).toBeNull();
      expect(range.endSeconds).toBe(600);
    });

    test("vazio (ambos null)", () => {
      const range = new TimeRange(null, null);
      expect(range.isEmpty).toBe(true);
    });

    test("horas grandes", () => {
      const range = new TimeRange("12:00:00", null);
      expect(range.startSeconds).toBe(43200);
    });
  });

  describe("toFfmpegArgs()", () => {
    test("com início e fim gera -ss e -t (duração)", () => {
      const range = new TimeRange("00:01:00", "00:03:00");
      const args = range.toFfmpegArgs();
      expect(args).toEqual(["-ss", "60", "-t", "120"]);
    });

    test("apenas fim gera -t", () => {
      const range = new TimeRange(null, "00:05:00");
      expect(range.toFfmpegArgs()).toEqual(["-t", "300"]);
    });

    test("apenas início gera -ss", () => {
      const range = new TimeRange("00:02:00", null);
      expect(range.toFfmpegArgs()).toEqual(["-ss", "120"]);
    });

    test("vazio retorna array vazio", () => {
      const range = new TimeRange(null, null);
      expect(range.toFfmpegArgs()).toEqual([]);
    });
  });

  describe("timecodes inválidos", () => {
    test("formato errado", () => {
      expect(() => new TimeRange("1:2:3", null)).toThrow(InvalidInputError);
    });

    test("minutos > 59", () => {
      expect(() => new TimeRange("00:60:00", null)).toThrow(InvalidInputError);
    });

    test("segundos > 59", () => {
      expect(() => new TimeRange("00:00:60", null)).toThrow(InvalidInputError);
    });

    test("início >= fim", () => {
      expect(() => new TimeRange("00:05:00", "00:03:00")).toThrow(
        InvalidInputError,
      );
    });

    test("início == fim", () => {
      expect(() => new TimeRange("00:05:00", "00:05:00")).toThrow(
        InvalidInputError,
      );
    });

    test("texto aleatório", () => {
      expect(() => new TimeRange("abc", null)).toThrow(InvalidInputError);
    });
  });
});
