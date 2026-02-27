import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ConversionTask } from "../../domain/entities/conversion-task.ts";
import { AudioCodec } from "../../domain/enums/audio-codec.ts";
import { EncodingPreset } from "../../domain/enums/encoding-preset.ts";
import { HardwareAccel } from "../../domain/enums/hardware-accel.ts";
import { VideoCodec } from "../../domain/enums/video-codec.ts";
import { ConversionFailedError } from "../../domain/errors/conversion-failed.error.ts";
import type { InputMediaInfo, MediaConverter } from "../../domain/ports/media-converter.port.ts";
import type { ConversionProgress } from "../../domain/value-objects/conversion-progress.ts";
import { createConversionProgress } from "../../domain/value-objects/conversion-progress.ts";
import { ProcessManager } from "../helpers/process-manager.ts";
import { resolveFfmpegBinary } from "../helpers/ffmpeg-resolver.ts";

const SOFTWARE_VIDEO_CODEC_MAP: Record<string, string> = {
  copy: "copy",
  h264: "libx264",
  h265: "libx265",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
};

const GPU_VIDEO_CODEC_MAP: Record<string, Record<string, string>> = {
  [HardwareAccel.Nvenc]: {
    h264: "h264_nvenc",
    h265: "hevc_nvenc",
    av1: "av1_nvenc",
  },
  [HardwareAccel.Qsv]: {
    h264: "h264_qsv",
    h265: "hevc_qsv",
  },
  [HardwareAccel.Vaapi]: {
    h264: "h264_vaapi",
    h265: "hevc_vaapi",
  },
  [HardwareAccel.Videotoolbox]: {
    h264: "h264_videotoolbox",
    h265: "hevc_videotoolbox",
  },
};

const AUDIO_CODEC_MAP: Record<string, string> = {
  copy: "copy",
  aac: "aac",
  opus: "libopus",
  mp3: "libmp3lame",
  flac: "flac",
};

const PRESET_MAP: Record<string, string> = {
  [EncodingPreset.Ultrafast]: "ultrafast",
  [EncodingPreset.Fast]: "fast",
  [EncodingPreset.Medium]: "medium",
  [EncodingPreset.Slow]: "slow",
};

// NVENC codecs that support -cq flag for quality control
const NVENC_CODECS = new Set(["h264_nvenc", "hevc_nvenc", "av1_nvenc"]);
// Software codecs that support -crf
const CRF_SOFTWARE_CODECS = new Set(["libx264", "libx265", "libvpx-vp9", "libaom-av1"]);

let cachedFfprobePath: string | null | undefined = undefined;

async function resolveFfprobeBinary(): Promise<string | null> {
  if (cachedFfprobePath !== undefined) return cachedFfprobePath;

  // Try system ffprobe first
  try {
    const proc = Bun.spawn(["which", "ffprobe"], { stdout: "pipe", stderr: "ignore" });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0 && output.trim()) {
      cachedFfprobePath = output.trim();
      return cachedFfprobePath;
    }
  } catch {
    // ignore
  }

  // Try deriving from ffmpeg path
  try {
    const ffmpegPath = await resolveFfmpegBinary();
    const dir = path.dirname(ffmpegPath);
    const candidate = path.join(dir, "ffprobe");
    const proc = Bun.spawn([candidate, "-version"], { stdout: "pipe", stderr: "ignore" });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      cachedFfprobePath = candidate;
      return cachedFfprobePath;
    }
  } catch {
    // ignore
  }

  cachedFfprobePath = null;
  return null;
}

export class FfmpegConverterAdapter implements MediaConverter {
  async getInputFileSize(inputPath: string): Promise<number> {
    const stat = await fs.stat(inputPath);
    return stat.size;
  }

  async getInputInfo(inputPath: string): Promise<InputMediaInfo | null> {
    const ffprobe = await resolveFfprobeBinary();
    if (!ffprobe) return null;

    try {
      const proc = Bun.spawn(
        [
          ffprobe,
          "-v", "quiet",
          "-print_format", "json",
          "-show_streams",
          "-show_format",
          inputPath,
        ],
        { stdout: "pipe", stderr: "ignore" },
      );

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) return null;

      const data = JSON.parse(output) as {
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          bit_rate?: string;
        }>;
        format?: {
          duration?: string;
          bit_rate?: string;
        };
      };

      const videoStream = data.streams?.find((s) => s.codec_type === "video");
      const audioStream = data.streams?.find((s) => s.codec_type === "audio");

      const durationSec = data.format?.duration ? parseFloat(data.format.duration) : null;
      const durationUs = durationSec && Number.isFinite(durationSec)
        ? Math.round(durationSec * 1_000_000)
        : null;

      const videoBitrateStr = videoStream?.bit_rate ?? data.format?.bit_rate;
      const videoBitrateKbps = videoBitrateStr
        ? Math.round(parseInt(videoBitrateStr, 10) / 1000)
        : null;

      return {
        durationUs,
        videoCodec: videoStream?.codec_name ?? null,
        audioCodec: audioStream?.codec_name ?? null,
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null,
        videoBitrateKbps: Number.isFinite(videoBitrateKbps ?? NaN) ? videoBitrateKbps : null,
      };
    } catch {
      return null;
    }
  }

  async convert(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
    onProgress?: (progress: ConversionProgress) => void,
  ): Promise<void> {
    const ffmpegBinary = await resolveFfmpegBinary();

    // Get input info for duration (enables real progress %)
    let totalTimeUs: number | null = null;
    if (onProgress) {
      const info = await this.getInputInfo(inputPath);
      totalTimeUs = info?.durationUs ?? null;
    }

    const inputSize = await this.getInputFileSize(inputPath);
    const args = this.buildArgs(inputPath, outputPath, task, !!onProgress);

    const proc = Bun.spawn([ffmpegBinary, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Register process for cleanup on SIGINT/SIGTERM
    const unregister = ProcessManager.register(proc);

    try {
      if (onProgress) {
        await this.streamProgress(proc.stdout, inputSize, totalTimeUs, onProgress);
      }

      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      unregister(); // Unregister after process completes

      if (exitCode !== 0) {
        throw new ConversionFailedError(
          `ffmpeg saiu com código ${exitCode}.\n${stderr.slice(-500)}`,
        );
      }
    } catch (error) {
      // Ensure process is killed if something goes wrong
      try {
        proc.kill(9); // SIGKILL
      } catch {
        // Ignore if already dead
      }
      unregister();
      throw error;
    }
  }

  private async streamProgress(
    stdout: ReadableStream<Uint8Array>,
    inputSize: number,
    totalTimeUs: number | null,
    onProgress: (progress: ConversionProgress) => void,
  ): Promise<void> {
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const progressData: Record<string, string> = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex);
            const val = trimmed.slice(eqIndex + 1);
            progressData[key] = val;
          }

          if (trimmed === "progress=continue") {
            const progress = this.parseProgress(progressData, inputSize, totalTimeUs);
            onProgress(progress);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseProgress(
    data: Record<string, string>,
    inputSize: number,
    totalTimeUs: number | null,
  ): ConversionProgress {
    return createConversionProgress({
      frame: this.parseNumber(data["frame"]),
      fps: this.parseNumber(data["fps"]),
      processedTimeUs: this.parseMicroseconds(data["out_time_us"]),
      totalTimeUs,
      speed: this.parseSpeed(data["speed"]),
      outputBytes: this.parseBytes(data["total_size"]),
      inputBytes: inputSize,
    });
  }

  private parseNumber(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }

  private parseMicroseconds(val: string | undefined): number {
    if (!val) return 0;
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? n : 0;
  }

  private parseSpeed(val: string | undefined): number | null {
    if (!val || val === "N/A") return null;
    const match = /^([\d.]+)\s*x\s*$/i.exec(val);
    if (match) {
      const n = parseFloat(match[1]!);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private parseBytes(val: string | undefined): number | null {
    if (!val || val === "N/A") return null;
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? n : null;
  }

  private buildArgs(
    inputPath: string,
    outputPath: string,
    task: ConversionTask,
    withProgress: boolean,
  ): string[] {
    const args: string[] = ["-hide_banner"];

    if (withProgress) {
      args.push("-progress", "pipe:1");
    } else {
      args.push("-loglevel", "warning");
    }

    args.push("-y");

    const useHwAccel = task.hardwareAccel !== HardwareAccel.None;
    const hwAccelFlag = useHwAccel ? this.getHwAccelFlag(task.hardwareAccel) : null;
    
    // Otimização: manter frames na GPU quando possível
    if (hwAccelFlag && task.videoCodec !== VideoCodec.Copy) {
      args.push("-hwaccel", hwAccelFlag);
      
      // Para NVIDIA, manter frames na VRAM para pipeline mais eficiente
      if (task.hardwareAccel === HardwareAccel.Nvenc) {
        args.push("-hwaccel_output_format", "cuda");
      }
    }

    if (!task.timeRange.isEmpty) {
      args.push(...task.timeRange.toFfmpegArgs());
    }

    args.push("-i", inputPath);

    if (task.threads !== null && task.threads > 0 && !useHwAccel) {
      args.push("-threads", String(task.threads));
    }

    if (task.extractAudio) {
      args.push("-vn");
      const codec = AUDIO_CODEC_MAP[task.audioCodec] ?? "copy";
      args.push("-c:a", codec);
      if (task.audioBitrate && task.audioCodec !== AudioCodec.Copy) {
        args.push("-b:a", task.audioBitrate.toFfmpegArg());
      }
    } else {
      if (task.noVideo) {
        args.push("-vn");
      } else {
        const vCodec = this.getVideoCodec(task);
        args.push("-c:v", vCodec);

        // Otimização: usar filtros CUDA para NVIDIA quando aplicável
        if (task.resolution && task.videoCodec !== VideoCodec.Copy) {
          const scaleFilter = useHwAccel && task.hardwareAccel === HardwareAccel.Nvenc
            ? this.getCudaScaleFilter(task.resolution)
            : `scale=${this.parseResolution(task.resolution)}`;
          args.push("-vf", scaleFilter);
        }

        if (task.fps !== null && task.videoCodec !== VideoCodec.Copy) {
          args.push("-r", String(task.fps));
        }

        if (task.videoCodec !== VideoCodec.Copy) {
          // CRF/quality control: takes precedence over fixed bitrate
          if (task.crf !== null) {
            this.applyCrfArg(args, vCodec, task.crf, task.hardwareAccel);
          } else if (task.videoBitrate) {
            args.push("-b:v", task.videoBitrate.toFfmpegArg());
          } else {
            // Fallback: aplicar CRF padrão para evitar bitrate ilimitado
            const defaultCrf = useHwAccel ? 28 : 23;
            this.applyCrfArg(args, vCodec, defaultCrf, task.hardwareAccel);
          }

          const presetStr = PRESET_MAP[task.preset] ?? (useHwAccel ? "fast" : "medium");
          args.push("-preset", presetStr);
        }
      }

      if (task.noAudio) {
        args.push("-an");
      } else {
        // Otimização: copiar áudio se possível para economizar CPU
        const aCodec = AUDIO_CODEC_MAP[task.audioCodec] ?? "copy";
        args.push("-c:a", aCodec);

        if (task.audioBitrate && task.audioCodec !== AudioCodec.Copy) {
          args.push("-b:a", task.audioBitrate.toFfmpegArg());
        }
      }
    }

    args.push("-movflags", "+faststart", outputPath);
    return args;
  }

  private getCudaScaleFilter(resolution: string): string {
    // Para NVIDIA, usar scale_cuda se disponível para processamento na GPU
    const presetMatch = /^(\d+)p$/i.exec(resolution);
    if (presetMatch) {
      const height = presetMatch[1];
      return `scale_cuda=-2:${height}`;
    }

    const wxhMatch = /^(\d+)x(\d+)$/i.exec(resolution);
    if (wxhMatch) {
      return `scale_cuda=${wxhMatch[1]}:${wxhMatch[2]}`;
    }

    // Fallback para scale normal se formato não reconhecido
    return `scale=${this.parseResolution(resolution)}`;
  }

  private applyCrfArg(
    args: string[],
    vCodec: string,
    crf: number,
    hardwareAccel: string,
  ): void {
    if (NVENC_CODECS.has(vCodec)) {
      // NVENC uses -cq for quality (0-51, same scale as CRF)
      // Use -rc vbr for variable bitrate mode with quality target
      args.push("-rc", "vbr");
      args.push("-cq", String(crf));
    } else if (hardwareAccel === HardwareAccel.Qsv) {
      args.push("-global_quality", String(crf));
    } else if (CRF_SOFTWARE_CODECS.has(vCodec)) {
      args.push("-crf", String(crf));
    }
    // VAAPI and Videotoolbox don't support CRF natively; silently skip
  }

  private getHwAccelFlag(hardwareAccel: string): string {
    switch (hardwareAccel) {
      case HardwareAccel.Nvenc:
        return "cuda";
      case HardwareAccel.Qsv:
        return "qsv";
      case HardwareAccel.Vaapi:
        return "vaapi";
      case HardwareAccel.Videotoolbox:
        return "videotoolbox";
      default:
        return "auto";
    }
  }

  private getVideoCodec(task: ConversionTask): string {
    if (task.videoCodec === VideoCodec.Copy) {
      return "copy";
    }

    const gpuCodecs = GPU_VIDEO_CODEC_MAP[task.hardwareAccel];
    if (gpuCodecs && task.hardwareAccel !== HardwareAccel.None) {
      const gpuCodec = gpuCodecs[task.videoCodec];
      if (gpuCodec) return gpuCodec;
    }

    return SOFTWARE_VIDEO_CODEC_MAP[task.videoCodec] ?? "copy";
  }

  private parseResolution(resolution: string): string {
    const presetMatch = /^(\d+)p$/i.exec(resolution);
    if (presetMatch) {
      return `-2:${presetMatch[1]}`;
    }

    const wxhMatch = /^(\d+)x(\d+)$/i.exec(resolution);
    if (wxhMatch) {
      return `${wxhMatch[1]}:${wxhMatch[2]}`;
    }

    return resolution;
  }
}
