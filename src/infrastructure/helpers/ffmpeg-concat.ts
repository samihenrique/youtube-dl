import * as fs from "node:fs/promises";
import { DownloadFailedError } from "../../domain/errors/download-failed.error.ts";
import { resolveFfmpegBinary } from "./ffmpeg-resolver.ts";

export async function concatMediaFiles(
  inputPaths: string[],
  outputPath: string,
): Promise<void> {
  if (inputPaths.length === 0) {
    throw new DownloadFailedError("Nenhum arquivo para concatenar.");
  }
  if (inputPaths.length === 1) {
    await fs.rename(inputPaths[0]!, outputPath);
    return;
  }

  const ffmpegBinary = await resolveFfmpegBinary();
  const listPath = `${outputPath}.concatlist`;

  const lines = inputPaths.map((p) => {
    const escaped = p.replace(/'/g, "'\\''");
    return `file '${escaped}'`;
  });
  await fs.writeFile(listPath, lines.join("\n"), "utf8");

  try {
    const proc = Bun.spawn(
      [
        ffmpegBinary,
        "-hide_banner",
        "-loglevel",
        "warning",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      { stdout: "ignore", stderr: "inherit" },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new DownloadFailedError(
        `ffmpeg falhou ao concatenar (exit code ${exitCode})`,
      );
    }
  } finally {
    await fs.rm(listPath, { force: true });
  }

  for (const p of inputPaths) {
    try {
      await fs.unlink(p);
    } catch {
      /* cleanup best-effort */
    }
  }
}
