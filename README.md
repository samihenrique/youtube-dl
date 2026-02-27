# @samihenrique/youtube-dl

Ultra-fast YouTube video and live stream downloader CLI with conversion support. Built with [Bun](https://bun.sh) for maximum performance.

## Features

- **Interactive CLI** with beautiful prompts powered by [@clack/prompts](https://github.com/bombshell-dev/clack)
- **YouTube Live support** with DVR via DASH (download from the beginning) and live-now modes
- **Parallel segment downloads** with configurable concurrency (up to 256)
- **Post-download conversion** via ffmpeg (format, codec, bitrate, resolution, trim, extract audio)
- **Batch file conversion** — convert existing local video files without downloading
- **Hardware acceleration** — NVIDIA NVENC, Intel QSV, AMD/Intel VAAPI, Apple VideoToolbox
- **Real-time hardware monitoring** — CPU and GPU usage during conversion
- **Conversion presets** — quick MP3 extract, MP4 optimized, Shrink 720p, or fully custom
- **Rigorous input validation** on every parameter
- **Clean Architecture** with full separation of concerns
- **Typed error hierarchy** with actionable messages — no suppressed errors
- **Graceful shutdown** on SIGINT/SIGTERM

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- [ffmpeg](https://ffmpeg.org/download.html) (system install recommended, falls back to `ffmpeg-static`)

## Installation

```bash
bun install @samihenrique/youtube-dl
```

Or clone and run locally:

```bash
git clone https://github.com/samihenrique/youtube-dl.git
cd youtube-dl
bun install
```

## Usage

### Interactive mode

Run without arguments to get a guided experience with selectable options for every parameter:

```bash
bun run src/main.ts
```

The interactive menu offers:

- **Download** — best quality, fastest settings
- **Choose quality** — pick specific resolution or audio-only
- **Customize** — full control over download and output options
- **View info** — show video details without downloading
- **Convert files** — batch convert existing local video files

### Non-interactive mode

Pass flags directly for scripting and automation:

```bash
# Basic download
bun run src/main.ts --url https://youtube.com/watch?v=dQw4w9WgXcQ

# Download and convert to 480p without audio using GPU
bun run src/main.ts --url https://youtube.com/watch?v=dQw4w9WgXcQ \
  --convert --resolution 480p --no-audio \
  --hardware-accel nvenc --preset ultrafast --crf 30
```

You can also set `YOUTUBE_LIVE_URL` as an environment variable as a fallback when `--url` is not provided.

### All flags

#### Download

| Flag | Description | Default |
|------|-------------|---------|
| `--url <url>` | YouTube URL (required in non-interactive) | — |
| `--quality <q>` | Video quality (best, 1080p, 720p, etc.) | best |
| `--live-mode <mode>` | Live stream mode: `dvr-start` or `live-now` | dvr-start |
| `--concurrency <n>` | Parallel segment downloads (1-256) | 4 |
| `--max-duration <s>` | Max duration in seconds | unlimited |
| `--rate-limit <r>` | Bandwidth limit (e.g., `10M`, `500K`) | unlimited |
| `--retries <n>` | Retries per segment (0-20) | 3 |
| `--timeout <s>` | Request timeout in seconds (5-300) | 30 |

#### Output

| Flag | Description | Default |
|------|-------------|---------|
| `--output-dir <path>` | Output directory | ./downloads |
| `--filename-pattern <p>` | `title-id`, `id-title`, or `title` | title-id |
| `--overwrite <b>` | `overwrite`, `skip`, or `rename` | rename |

#### Conversion

| Flag | Description | Default |
|------|-------------|---------|
| `--convert` | Enable post-download conversion | off |
| `--format <f>` | Output format: `mp4`, `mkv`, `webm`, `avi`, `mov` | mp4 |
| `--extract-audio <f>` | Extract audio: `mp3`, `aac`, `opus`, `flac`, `wav`, `ogg` | — |
| `--video-codec <c>` | `copy`, `h264`, `h265`, `vp9`, `av1` | copy |
| `--audio-codec <c>` | `copy`, `aac`, `opus`, `mp3`, `flac` | copy |
| `--video-bitrate <b>` | Video bitrate (e.g., `5M`) | auto |
| `--audio-bitrate <b>` | Audio bitrate (e.g., `192k`) | auto |
| `--resolution <r>` | Resolution (e.g., `1920x1080` or `720p`) | original |
| `--fps <n>` | Frame rate (1-120) | original |
| `--trim-start <t>` | Trim start (HH:MM:SS) | — |
| `--trim-end <t>` | Trim end (HH:MM:SS) | — |
| `--no-audio` | Remove audio track | off |
| `--no-video` | Remove video track | off |
| `--crf <n>` | Quality (0-51, lower=better, NVENC: 0-51, CPU: 0-63) | 23 |

#### Encoding performance

| Flag | Description | Default |
|------|-------------|---------|
| `--hardware-accel <a>` | `none`, `auto`, `nvenc`, `qsv`, `vaapi`, `videotoolbox` | auto |
| `--threads <n>` | CPU threads for encoding (1-128) | auto |
| `--preset <p>` | Encoding speed: `ultrafast`, `fast`, `medium`, `slow` | fast |

#### Other

| Flag | Description |
|------|-------------|
| `--info-only` | Show video info without downloading |

### Live stream modes

| Mode | Description |
|------|-------------|
| `dvr-start` | Download the full DVR window from the beginning (uses DASH) |
| `live-now` | Record from the current live position onward |

### Conversion presets (interactive)

When converting in interactive mode, quick presets are available:

| Preset | Description |
|--------|-------------|
| MP3 | Extract audio as MP3 @ 192k |
| MP4 otimizado | H.264 + AAC @ 192k, CRF 23, hardware auto |
| Reduzir 720p | H.264 @ 1280×720 30fps, CRF 28, AAC @ 128k |
| **⚡ Rápido 480p** | **H.264 @ 854×480 30fps, CRF 30, no audio, ultrafast preset, hardware auto** |
| Personalizado | Full control over all parameters |

### Batch file conversion

Convert existing local files without downloading:

```bash
# Interactive — select files from a directory
bun run src/main.ts   # choose "Converter vídeos já baixados" from main menu
```

Supports `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.flv`, `.wmv`, `.m4v`. Output files are saved alongside the originals as `{name}.converted.{ext}`. Features real-time progress with hardware monitoring (CPU/GPU usage) and automatic cleanup of ffmpeg processes on interruption.

## Architecture

The project follows **Clean Architecture** principles:

```
src/
├── domain/          # Entities, value objects, enums, errors, ports (interfaces)
├── application/     # Use cases and domain services
├── infrastructure/  # Adapters (YouTube API, ffmpeg, HTTP, hardware monitor)
├── presentation/    # CLI app, prompts, validators, renderers
├── container.ts     # Dependency composition
└── main.ts          # Entry point
```

**Dependency rule**: inner layers never depend on outer layers. Use cases depend on ports (interfaces), and adapters implement those ports.

## Testing

```bash
bun test
```

152 tests covering domain validation, use case orchestration, infrastructure helpers, and input validators.

## License

[MIT](LICENSE)
