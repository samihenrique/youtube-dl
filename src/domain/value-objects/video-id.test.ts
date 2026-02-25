import { describe, expect, test } from "bun:test";
import { VideoId } from "./video-id.ts";
import { InvalidInputError } from "../errors/invalid-input.error.ts";

describe("VideoId", () => {
  test("aceita ID válido de 11 caracteres", () => {
    const id = new VideoId("dQw4w9WgXcQ");
    expect(id.value).toBe("dQw4w9WgXcQ");
  });

  test("aceita ID com underscores e hífens", () => {
    const id = new VideoId("abc_def-GHI");
    expect(id.value).toBe("abc_def-GHI");
  });

  test("aceita ID com espaços em volta (trims)", () => {
    const id = new VideoId("  dQw4w9WgXcQ  ");
    expect(id.value).toBe("dQw4w9WgXcQ");
  });

  test("rejeita ID muito curto (< 8 chars)", () => {
    expect(() => new VideoId("abc")).toThrow(InvalidInputError);
  });

  test("rejeita ID com caracteres inválidos", () => {
    expect(() => new VideoId("dQw4w9Wg!cQ")).toThrow(InvalidInputError);
  });

  test("rejeita string vazia", () => {
    expect(() => new VideoId("")).toThrow(InvalidInputError);
  });
});
