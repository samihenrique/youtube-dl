import { describe, expect, test } from "bun:test";
import {
  validateUrl,
  validateInteger,
  validateOptionalInteger,
  validatePositiveInteger,
  validateBitrate,
  validateTimeCode,
  validateResolution,
  validatePath,
} from "./input.validators.ts";

describe("validateUrl", () => {
  test("aceita youtube.com", () =>
    expect(validateUrl("https://youtube.com/watch?v=abc")).toBeUndefined());
  test("aceita youtu.be", () =>
    expect(validateUrl("https://youtu.be/abc")).toBeUndefined());
  test("rejeita vazio", () => expect(validateUrl("")).toBeDefined());
  test("rejeita outro domínio", () =>
    expect(validateUrl("https://vimeo.com/123")).toBeDefined());
});

describe("validateInteger", () => {
  test("valor dentro do range", () =>
    expect(validateInteger("5", 1, 10, "test")).toBeUndefined());
  test("valor no limite inferior", () =>
    expect(validateInteger("1", 1, 10, "test")).toBeUndefined());
  test("valor no limite superior", () =>
    expect(validateInteger("10", 1, 10, "test")).toBeUndefined());
  test("rejeita abaixo do range", () =>
    expect(validateInteger("0", 1, 10, "test")).toBeDefined());
  test("rejeita acima do range", () =>
    expect(validateInteger("11", 1, 10, "test")).toBeDefined());
  test("rejeita float", () =>
    expect(validateInteger("5.5", 1, 10, "test")).toBeDefined());
  test("rejeita texto", () =>
    expect(validateInteger("abc", 1, 10, "test")).toBeDefined());
  test("rejeita vazio", () =>
    expect(validateInteger("", 1, 10, "test")).toBeDefined());
});

describe("validateOptionalInteger", () => {
  test("aceita vazio", () =>
    expect(validateOptionalInteger("", 1, 10, "test")).toBeUndefined());
  test("valida quando tem valor", () =>
    expect(validateOptionalInteger("5", 1, 10, "test")).toBeUndefined());
  test("rejeita valor inválido", () =>
    expect(validateOptionalInteger("11", 1, 10, "test")).toBeDefined());
});

describe("validatePositiveInteger", () => {
  test("aceita vazio (opcional)", () =>
    expect(validatePositiveInteger("", "test")).toBeUndefined());
  test("aceita inteiro positivo", () =>
    expect(validatePositiveInteger("42", "test")).toBeUndefined());
  test("rejeita zero", () =>
    expect(validatePositiveInteger("0", "test")).toBeDefined());
  test("rejeita negativo", () =>
    expect(validatePositiveInteger("-1", "test")).toBeDefined());
});

describe("validateBitrate", () => {
  test("aceita vazio (opcional)", () =>
    expect(validateBitrate("")).toBeUndefined());
  test("aceita 5M", () => expect(validateBitrate("5M")).toBeUndefined());
  test("aceita 192k", () => expect(validateBitrate("192k")).toBeUndefined());
  test("aceita 2500K", () => expect(validateBitrate("2500K")).toBeUndefined());
  test("rejeita sem unidade", () => expect(validateBitrate("500")).toBeDefined());
  test("rejeita texto", () => expect(validateBitrate("rapido")).toBeDefined());
});

describe("validateTimeCode", () => {
  test("aceita vazio (opcional)", () =>
    expect(validateTimeCode("")).toBeUndefined());
  test("aceita 01:30:00", () =>
    expect(validateTimeCode("01:30:00")).toBeUndefined());
  test("aceita 0:00:00", () =>
    expect(validateTimeCode("0:00:00")).toBeUndefined());
  test("rejeita minutos > 59", () =>
    expect(validateTimeCode("00:60:00")).toBeDefined());
  test("rejeita segundos > 59", () =>
    expect(validateTimeCode("00:00:60")).toBeDefined());
  test("rejeita formato errado", () =>
    expect(validateTimeCode("1:2:3")).toBeDefined());
});

describe("validateResolution", () => {
  test("aceita vazio", () =>
    expect(validateResolution("")).toBeUndefined());
  test("aceita 1920x1080", () =>
    expect(validateResolution("1920x1080")).toBeUndefined());
  test("aceita 720p", () =>
    expect(validateResolution("720p")).toBeUndefined());
  test("rejeita texto aleatório", () =>
    expect(validateResolution("grande")).toBeDefined());
});

describe("validatePath", () => {
  test("aceita caminho normal", () =>
    expect(validatePath("./downloads")).toBeUndefined());
  test("aceita caminho absoluto", () =>
    expect(validatePath("/home/user/videos")).toBeUndefined());
  test("rejeita vazio", () => expect(validatePath("")).toBeDefined());
  test("rejeita caracteres inválidos", () =>
    expect(validatePath('path<>"with|bad*chars')).toBeDefined());
});
