import { describe, expect, test } from "bun:test";
import { sanitizeFilename } from "./filename.ts";

describe("sanitizeFilename", () => {
  test("remove caracteres proibidos do Windows", () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe("filename");
  });

  test("colapsa espaços múltiplos", () => {
    expect(sanitizeFilename("my   video   title")).toBe("my video title");
  });

  test("remove caracteres de controle", () => {
    expect(sanitizeFilename("file\x00\x1Fname")).toBe("filename");
  });

  test("mantém caracteres válidos", () => {
    expect(sanitizeFilename("Meu Vídeo - 2024 (HD)")).toBe(
      "Meu Vídeo - 2024 (HD)",
    );
  });

  test("trim espaços nas bordas", () => {
    expect(sanitizeFilename("  hello  ")).toBe("hello");
  });

  test("retorna vazio se tudo é inválido", () => {
    expect(sanitizeFilename(':"<>|')).toBe("");
  });
});
