# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**youtube-dl** (`@samihenrique/youtube-dl`) is a CLI tool for downloading YouTube videos and live streams with parallel segment downloads and post-download ffmpeg conversion. Built with Bun and TypeScript.

## Commands

```bash
bun install              # Install dependencies
bun run src/main.ts      # Run the CLI (interactive mode)
bun run src/main.ts --url <url>  # Non-interactive mode
bun test                 # Run all 145+ tests
bun test src/domain/     # Run tests in a specific directory
bun test --test-name-pattern "pattern"  # Run tests matching a pattern
bun run typecheck        # Type-check without emitting (tsc --noEmit)
```

## Architecture

Clean Architecture with strict dependency rule — inner layers never import from outer layers.

```
src/
├── domain/          # Core: entities, value objects, enums, errors, ports (interfaces)
├── application/     # Use cases (orchestration) and domain services (HLS parsing, segment discovery)
├── infrastructure/  # Adapters implementing domain ports (YouTube API via youtubei.js, ffmpeg, HTTP)
├── presentation/    # CLI layer: arg parsing, interactive prompts (@clack/prompts), progress rendering
├── container.ts     # Manual DI — wires adapters to use cases
└── main.ts          # Entry point — parses args, creates container, runs CliApp
```

**Key use cases:** `ResolveVideoInfoUseCase`, `DownloadVideoUseCase`, `DownloadLiveUseCase`, `ConvertMediaUseCase`

**Ports pattern:** Domain defines interfaces (e.g., `VideoDownloaderPort`, `MediaConverterPort`) in `domain/ports/`. Infrastructure adapters implement these ports. Use cases receive ports via constructor injection, wired in `container.ts`.

**Path aliases** configured in `tsconfig.json`: `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*`

## Tech Stack & Conventions

- **Runtime:** Bun (>= 1.0.0). Always use `bun` commands, never Node/npm/yarn.
- **YouTube API:** `youtubei.js` (innertube client)
- **CLI prompts:** `@clack/prompts` with `picocolors` for styling
- **ffmpeg:** System install preferred, falls back to `ffmpeg-static` package
- **Error handling:** Typed error hierarchy extending `DomainError` (with `.code` property). All domain errors in `domain/errors/`.
- **Value objects:** Self-validating (e.g., `VideoUrl`, `VideoId`, `Bitrate`, `TimeRange`) — validation lives in constructors.
- **Language:** UI strings and log messages are in Portuguese (pt-BR).
