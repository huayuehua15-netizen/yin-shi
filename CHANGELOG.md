# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-11-24

### Added

- **Typed API client** (`src/api/client.ts`): one `ApiError` contract, offline
  detection, abort signals, and envelope unwrapping shared by the workspace,
  the ingestion modal, and the coaching assistant.
- **Request tracing**: every response carries `X-Request-Id`; API calls are
  logged with method, route, status, and latency.
- **Operational endpoints**: `/api/health` now reports the running version and
  the active provider; `SIGINT` / `SIGTERM` drain in-flight requests.
- **Engineering baseline**: `package-lock.json`, ESLint 10 flat config, Prettier,
  `.editorconfig`, `.nvmrc`, `strict` TypeScript with unused checks, and a
  cross-platform `cross-env` production start script.
- **Repository hygiene**: Dependabot, issue forms, PR template, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, and a rewritten README with fresh screenshots and an
  interview-oriented case study.
- **Tests**: concurrent store mutations, empty-store persistence, corruption
  recovery, and eight API-client contract tests (35 total).

### Fixed

- **Lost updates under concurrency**: `PATCH` handlers now serialize
  read-modify-write cycles per `calls.json` instead of racing on the same snapshot.
- **Torn writes**: the store writes to a temp file and atomically renames it, so a
  crash can no longer leave a half-written JSON document.
- **Deleted calls resurrecting**: an intentionally empty store (`[]`) is now a
  valid state and no longer re-seeds the sample library on the next read.
- **Corruption data loss**: unreadable `calls.json` is preserved as
  `calls.json.corrupt-<timestamp>` before the store reseeds.
- **Vite 8 config warning**: `__dirname` replaced with `import.meta.dirname`, and
  the dead `src/assets` copy plugin removed.
- **Windows production start**: `NODE_ENV=production` no longer depends on a
  POSIX shell.

### Changed

- Frontend bundle split into `react`, `icons`, and application chunks; the entry
  chunk dropped from ~345 kB to ~121 kB (32 kB gzip).
- `tsx` moved to runtime dependencies; build tooling moved to dev dependencies.
- Coverage is collected in CI (`npm run test:coverage`) and uploaded as an artifact.

## [1.0.0] — 2026-11-18

### Added

- Speaker-diarized transcripts with speaker filters, keyword search, bookmarks,
  and manager notes.
- Sentiment and engagement timeline with inflection milestones and a synced
  audio playhead.
- Evidence-backed coaching cards (MEDDPICC / SPIN / Challenger / General B2B)
  with 3 strengths, 3 missed opportunities, and a trackable next step.
- Multi-call team overview, Markdown / SRT / TXT exports, and a bilingual UI.
- Zero-key deterministic analyzer, Gemini mode, and any OpenAI-compatible or
  Ollama endpoint.
- Docker Compose self-hosting and a GitHub Actions verification pipeline.
