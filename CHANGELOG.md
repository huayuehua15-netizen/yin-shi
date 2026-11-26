# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] — 2026-11-26

### Added

- **Browser-level end-to-end checks (`npm run e2e`).** The HTTP smoke suite
  proves the API contract but says nothing about whether a person can use the
  product. `scripts/e2e.mjs` boots the production build against a throwaway
  data directory, then drives a real Chrome through 13 flows: render the
  workspace, ingest a call via Paste Text, confirm it persisted, filter the
  library and clear the filter, bookmark a turn (verified through `PATCH`),
  narrow to the bookmarked filter, flip the next-step state, delete the call,
  open the overview tracker, keep focus inside the shortcuts dialog, and hold
  the layout at six widths from 1440 down to 390px with the mobile drawer.
  Chrome is auto-detected per platform or supplied through `CHROME_PATH`.

### Changed

- CI grows a **Browser E2E** job that builds the bundle and runs the flows in
  headless Chrome on Node 22.

### Quality

- 60 unit tests, 11 smoke checks, 13 browser checks.

## [1.3.3] — 2026-11-25

### Fixed

- **A silent Windows port conflict that made `localhost` show another project.**
  `0.0.0.0:3000` and `127.0.0.1:3000` can be bound by two processes at once, so
  this server could start cleanly while the browser was answered by whoever
  owned the loopback address. On startup it now probes
  `127.0.0.1:$PORT/api/health` and warns when the reply is not its own version,
  naming the port to switch to instead. Verified against a real conflict: port
  3000 owned by a Docker container serving a different app.

### Added

- Four tests for the loopback probe: our own server, a foreign version,
  a non-health 404, and nothing listening.

### Quality

- 60 unit tests, 11 smoke checks. Coverage 91.87% line / 81.70% branch / 92.17%
  function.

## [1.3.2] — 2026-11-25

### Fixed

- **The Docker image could not build on a network where Docker Hub is
  unreachable.** The `# syntax=docker/dockerfile:1.7` frontend has to be pulled
  from Docker Hub before the first stage even starts, and failed with a TLS
  handshake timeout. The file now sticks to stock BuildKit, so it builds from
  the local `node:22-alpine` base with no frontend fetch. npm packages go
  through `NPM_REGISTRY` (defaults to npmmirror, overridable with
  `--build-arg NPM_REGISTRY=https://registry.npmjs.org`). `.dockerignore` also
  drops `docs/` and `scripts/` from the build context.
- **A busy port reported only `Failed to start server`.** `describeListenError()`
  now turns `EADDRINUSE` / `EACCES` into an actionable line — the taken port,
  why, and the exact command to start on the next port. Other listen errors
  still throw as before.

### Verified

- Built `cadence:local` and ran it on port 3190: `/api/health` returned
  `version: 1.3.2` with `provider: local`, the SPA shell loaded, and the zero-key
  `/api/analyze-call` pipeline produced 3 diarized turns and a full coaching
  card inside the container.

### Quality

- 56 unit tests, 11 smoke checks. Coverage 91.88% line / 81.24% branch / 91.82%
  function.

## [1.3.1] — 2026-11-25

### Changed

- **Routes split per endpoint.** `server/routes/analysis.ts` (317 lines holding
  three unrelated endpoints) is gone: `transcribe.ts`, `analyzeCall.ts` and
  `coachChat.ts` each own exactly one endpoint, and `upload.ts` holds the shared
  multipart type so no route module has to import multer's typings.
- **The 503 fallback is a strategy, not three copies of the same try/catch.**
  `server/analysis/fallback.ts` exposes `isProviderUnavailable()` and
  `withLocalFallback()`; every provider path now degrades to the deterministic
  local engine through one tested seam. Behaviour is unchanged: only
  503 / UNAVAILABLE degrade, every other error still surfaces.

### Added

- Five tests for the fallback strategy: primary success, 503, UNAVAILABLE,
  non-availability errors that must not be swallowed, and async fallbacks.

### Quality

- 53 unit tests, 11 smoke checks. Coverage 92.45% line / 80.86% branch / 92.06%
  function.

## [1.3.0] — 2026-11-25

### Changed

- **`server.ts` split from 1300 lines into 10 focused modules, with zero
  behaviour change.** The entry point is now 34 lines (boot, listen, graceful
  shutdown). Responsibilities moved to:
  `server/config.ts` (env probes and provider capabilities),
  `server/analysis/normalize.ts` (shared output repair),
  `server/analysis/gemini.ts` and `server/analysis/openai.ts` (each protocol),
  `server/routes/calls.ts` and `server/routes/analysis.ts` (resource boundaries),
  and `server/app.ts` (middleware order and Vite/static hosting).
  Route registration, middleware order, response shapes and status codes are
  unchanged; the 11 smoke checks and the built bundle sizes confirm it.
- `npm test` now discovers `server/**/*.test.ts`, so subdirectories can hold
  their own suites.

### Added

- **Tests for `normalizeParsedAnalysis`**, the shared post-processing path every
  provider output passes through and which previously had no coverage: junk
  payloads, out-of-range timestamps, unsorted timelines, blank turns, model
  supplied `speakerLabel`, preserved `nextStepRecommendation`, and an empty
  object that still yields a valid coaching card.

### Quality

- 48 unit tests, 11 smoke checks. Coverage 92.51% line / 80.00% branch / 92.46%
  function (from 92.11 / 79.43 / 91.67).

## [1.2.0] — 2026-11-25

### Added

- **Dialog focus management** (`useDialogFocus` + `resolveTabTarget`): dialogs
  focus their first control on mount, keep Tab and Shift+Tab inside the
  boundary, and hand focus back to the trigger on close. Six unit tests cover
  the wrap-around rules.
- **`npm run smoke`**: boots the real server against a throwaway data directory
  and asserts 11 contract checks — static hosting, asset serving, health,
  capabilities, CRUD round-trips, the zero-key analysis pipeline, JSON 404s,
  path traversal rejection, and request-id echo. Wired into CI as a separate
  job.
- **Next Step Tracker** on the team overview: every coaching card's next step
  with its done / open state, replacing the previous topic bar chart.

### Changed

- **Sentiment chart is now measured, not stretched.** The SVG tracks its
  container width through a `ResizeObserver` and renders at a fixed 200px
  height with a 1:1 pixel mapping, so stroke weights and labels stay correct on
  ultrawide screens. The workspace now shows the transcript and coaching card
  above the fold.
- Key moments are a single horizontally scrollable row instead of wrapping into
  a second line.
- The floating shortcuts button moved into the sidebar footer; it used to cover
  the bottom of the coaching card.
- Library rows are two lines: the title clamps to two lines and the meta row
  keeps the duration visible while the account name truncates.
- Below 640px the New Call button collapses to its icon, so the header stops
  overflowing.

### Fixed

- **Hydration race**: a call added while the initial `/api/calls` request was
  still in flight could be replaced by the older server snapshot.
- **Stranded optimistic updates**: a failed `PATCH` or `DELETE` now resyncs from
  the server instead of leaving the UI showing a change that was never persisted.
- Transcript search and sidebar metadata no longer clip at common widths.

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
