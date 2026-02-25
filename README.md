# @samihenrique/youtube-dl

Ultra-fast YouTube video and live stream downloader CLI with conversion support. Built with [Bun](https://bun.sh) for maximum performance.

## Features

- **Interactive CLI** with beautiful prompts powered by [@clack/prompts](https://github.com/bombshell-dev/clack)
- **YouTube Live support** with DVR (download from the beginning) and live-now modes
- **Parallel segment downloads** with configurable concurrency
- **Post-download conversion** via ffmpeg (format, codec, bitrate, resolution, trim, extract audio)
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

### Non-interactive mode

Pass flags directly for scripting and automation:

```bash
bun run src/main.ts --url https://youtube.com/watch?v=dQw4w9WgXcQ
```

### All flags

#### Download

| Flag | Description | Default |
|------|-------------|---------|
| `--url <url>` | YouTube URL (required in non-interactive) | — |
| `--quality <q>` | Video quality (best, 1080p, 720p, etc.) | best |
| `--live-mode <mode>` | Live download mode: `dvr-start` or `live-now` | dvr-start |
| `--concurrency <n>` | Parallel segment downloads (1-64) | 8 |
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

#### Other

| Flag | Description |
|------|-------------|
| `--info-only` | Show video info without downloading |

## Architecture

The project follows **Clean Architecture** principles:

```
src/
├── domain/          # Entities, value objects, enums, errors, ports (interfaces)
├── application/     # Use cases and domain services
├── infrastructure/  # Adapters (YouTube API, ffmpeg, HTTP)
├── presentation/    # CLI app, prompts, validators, renderers
├── container.ts     # Dependency composition
└── main.ts          # Entry point
```

**Dependency rule**: inner layers never depend on outer layers. Use cases depend on ports (interfaces), and adapters implement those ports.

## Testing

```bash
bun test
```

149 tests covering domain validation, use case orchestration, infrastructure helpers, and input validators.

## License

[MIT](LICENSE)
