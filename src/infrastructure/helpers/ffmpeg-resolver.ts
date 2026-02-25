import { FfmpegNotFoundError } from "../../domain/errors/ffmpeg-not-found.error.ts";

let cachedPath: string | null = null;

export async function resolveFfmpegBinary(): Promise<string> {
  if (cachedPath) return cachedPath;

  const systemPath = await findSystemFfmpeg();
  if (systemPath) {
    cachedPath = systemPath;
    return systemPath;
  }

  const staticPath = await findStaticFfmpeg();
  if (staticPath) {
    cachedPath = staticPath;
    return staticPath;
  }

  throw new FfmpegNotFoundError();
}

async function findSystemFfmpeg(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["which", "ffmpeg"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    const trimmed = output.trim();
    return exitCode === 0 && trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

async function findStaticFfmpeg(): Promise<string | null> {
  try {
    const mod = await import("ffmpeg-static");
    const path = (mod.default ?? mod) as string | null;
    return path ?? null;
  } catch {
    return null;
  }
}
