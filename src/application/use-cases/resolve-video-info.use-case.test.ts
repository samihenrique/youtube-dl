import { describe, expect, test, mock } from "bun:test";
import { ResolveVideoInfoUseCase } from "./resolve-video-info.use-case.ts";
import type { VideoInfoProvider } from "../../domain/ports/video-info-provider.port.ts";
import type { VideoInfo } from "../../domain/entities/video-info.ts";
import { VideoType } from "../../domain/enums/video-type.ts";
import { InvalidUrlError } from "../../domain/errors/invalid-url.error.ts";
import { VideoUnavailableError } from "../../domain/errors/video-unavailable.error.ts";

function createMockProvider(info: VideoInfo): VideoInfoProvider {
  return { resolve: mock(() => Promise.resolve(info)) };
}

function createFailingProvider(error: Error): VideoInfoProvider {
  return { resolve: mock(() => Promise.reject(error)) };
}

const sampleVideoInfo: VideoInfo = {
  id: "dQw4w9WgXcQ",
  title: "Test Video",
  type: VideoType.Video,
  durationSeconds: 300,
  hlsManifestUrl: null,
  qualities: [],
};

const sampleLiveInfo: VideoInfo = {
  ...sampleVideoInfo,
  type: VideoType.Live,
  hlsManifestUrl: "https://example.com/manifest.m3u8",
};

describe("ResolveVideoInfoUseCase", () => {
  test("resolve vídeo comum com sucesso", async () => {
    const provider = createMockProvider(sampleVideoInfo);
    const useCase = new ResolveVideoInfoUseCase(provider);

    const result = await useCase.execute(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(result.id).toBe("dQw4w9WgXcQ");
    expect(result.type).toBe(VideoType.Video);
    expect(provider.resolve).toHaveBeenCalledWith("dQw4w9WgXcQ");
  });

  test("resolve live com sucesso", async () => {
    const provider = createMockProvider(sampleLiveInfo);
    const useCase = new ResolveVideoInfoUseCase(provider);

    const result = await useCase.execute(
      "https://youtube.com/live/dQw4w9WgXcQ",
    );

    expect(result.type).toBe(VideoType.Live);
    expect(result.hlsManifestUrl).toBeTruthy();
  });

  test("lança InvalidUrlError para URL inválida", async () => {
    const provider = createMockProvider(sampleVideoInfo);
    const useCase = new ResolveVideoInfoUseCase(provider);

    await expect(useCase.execute("https://invalid.com")).rejects.toThrow(
      InvalidUrlError,
    );
  });

  test("lança VideoUnavailableError quando provider falha", async () => {
    const provider = createFailingProvider(new Error("network error"));
    const useCase = new ResolveVideoInfoUseCase(provider);

    await expect(
      useCase.execute("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toThrow(VideoUnavailableError);
  });

  test("preserva o erro original como cause", async () => {
    const originalError = new Error("connection refused");
    const provider = createFailingProvider(originalError);
    const useCase = new ResolveVideoInfoUseCase(provider);

    try {
      await useCase.execute("https://youtube.com/watch?v=dQw4w9WgXcQ");
      expect.unreachable("deveria ter lançado erro");
    } catch (error) {
      expect(error).toBeInstanceOf(VideoUnavailableError);
      expect((error as VideoUnavailableError).cause).toBe(originalError);
    }
  });
});
