import { describe, expect, test } from "bun:test";
import { VideoUrl } from "./video-url.ts";
import { InvalidUrlError } from "../errors/invalid-url.error.ts";

describe("VideoUrl", () => {
  describe("URLs válidas", () => {
    test("youtube.com/watch?v=ID", () => {
      const url = new VideoUrl("https://youtube.com/watch?v=dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
      expect(url.value).toBe("https://youtube.com/watch?v=dQw4w9WgXcQ");
    });

    test("www.youtube.com/watch?v=ID", () => {
      const url = new VideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("youtu.be/ID", () => {
      const url = new VideoUrl("https://youtu.be/dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("youtube.com/live/ID", () => {
      const url = new VideoUrl("https://youtube.com/live/dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("youtube.com/shorts/ID", () => {
      const url = new VideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("youtube.com/embed/ID", () => {
      const url = new VideoUrl("https://youtube.com/embed/dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("m.youtube.com/watch?v=ID", () => {
      const url = new VideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("music.youtube.com/watch?v=ID", () => {
      const url = new VideoUrl(
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      );
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("aceita URL com espaços em volta", () => {
      const url = new VideoUrl(
        "  https://youtube.com/watch?v=dQw4w9WgXcQ  ",
      );
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });

    test("aceita http (sem TLS)", () => {
      const url = new VideoUrl("http://youtube.com/watch?v=dQw4w9WgXcQ");
      expect(url.videoId).toBe("dQw4w9WgXcQ");
    });
  });

  describe("URLs inválidas", () => {
    test("string vazia", () => {
      expect(() => new VideoUrl("")).toThrow(InvalidUrlError);
    });

    test("URL de outro domínio", () => {
      expect(() => new VideoUrl("https://vimeo.com/123456")).toThrow(
        InvalidUrlError,
      );
    });

    test("URL sem ID de vídeo", () => {
      expect(() => new VideoUrl("https://youtube.com/")).toThrow(
        InvalidUrlError,
      );
    });

    test("URL com ID muito curto", () => {
      expect(() => new VideoUrl("https://youtube.com/watch?v=abc")).toThrow(
        InvalidUrlError,
      );
    });

    test("protocolo inválido (ftp)", () => {
      expect(
        () => new VideoUrl("ftp://youtube.com/watch?v=dQw4w9WgXcQ"),
      ).toThrow(InvalidUrlError);
    });

    test("string aleatória", () => {
      expect(() => new VideoUrl("isso não é uma url")).toThrow(InvalidUrlError);
    });
  });
});
