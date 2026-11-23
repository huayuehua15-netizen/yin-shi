# Cadence — Open-Source Sales Coaching Intelligence Platform

Cadence is a full-stack Node.js and React sales coaching intelligence platform that transforms recorded or live sales conversations into speaker-diarized transcripts, sentiment and engagement timelines, and structured AI coaching cards.

## Key Capabilities

- **Multi-Source Call Ingestion**:
  - **Audio File Upload**: Drag-and-drop or upload `.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`, `.aac`, or `.flac` recordings (up to 25 MB).
  - **Live Microphone Recording**: Capture browser microphone audio (`MediaRecorder` + Web Audio level meter) and transcribe immediately using **Gemini 3.5 Transcribe** (`gemini-3.5-transcribe`).
  - **Transcript Paste Mode**: Paste raw call notes or dialogue to run immediate diarization and coaching analysis.
- **Speaker-Diarized Transcript (`Speaker A` vs `Speaker B`)**:
  - Filter by speaker (`All Speakers`, `Speaker A`, `Speaker B`, or `Bookmarked`), search keywords/topics/notes, bookmark pivotal turns, and attach persistent manager coaching notes.
- **Interactive Sentiment & Engagement Graph**:
  - Plots **Engagement**, **Prospect Sentiment**, and **Rep Energy** across the call timeline alongside clickable inflection milestones, conversation hygiene metrics (rep questions asked, longest monologue), and a synchronized audio playback head.
- **AI Coaching Card (`gemini-4-hydrogen`)**:
  - Evaluates calls against configurable frameworks (**MEDDPICC**, **SPIN Selling**, **Challenger**, **General B2B**), highlighting **3 Things Done Well**, **3 Missed Opportunities** with verbatim evidence quotes and timestamp jumps, a trackable Next Step action, and an inline **Follow-up Coaching** assistant.
- **Team Overview & Exports**:
  - Multi-call library aggregation (avg talk ratio, avg engagement, avg prospect sentiment, recurring topic breakdown) plus one-click exports in **Markdown (`.md`)**, **SubRip Subtitles (`.srt`)**, and **Plain Text (`.txt`)**.
- **Bilingual UI (English / 简体中文)**:
  - Instant header switcher (`中文` / `EN`) persisted in `localStorage` (`cadence-locale`), adapting navigation, charts, transcript filters, coaching prompts, and ingestion dialogs cleanly.
- **Node.js Persistence & Audio Streaming**:
  - Express backend (`server.ts` + `server/store.ts`) persists call records to `data/calls.json` and uploaded audio to `data/uploads/`, streaming audio with HTTP `Range` support (`/api/audio/:filename`).

## Architecture

```text
├── server.ts                  # Node.js Express API + Vite SSR/static host
├── server/
│   ├── localAnalyzer.ts       # Zero-key deterministic diarization & coaching engine
│   └── store.ts               # JSON file persistence (data/calls.json) & audio storage
├── src/
│   ├── App.tsx                # Main workspace controller
│   ├── components/            # Modular UI (SentimentGraph, DiarizedTranscript, CoachingCard, TeamOverview, UploadCallModal)
│   ├── data/sampleCalls.ts    # Pre-seeded realistic B2B sales calls
│   ├── i18n/translations.ts   # English & Simplified Chinese (简体中文) UI dictionary
│   ├── types/call.ts          # Shared TypeScript interfaces
│   └── utils/
│       ├── callAnalytics.ts   # Pure talk-ratio, hygiene metrics, overview & export formatters
│       └── callAnalytics.test.ts
├── .github/workflows/ci.yml   # GitHub Actions CI (test, typecheck, build)
├── .gitmessage                # Git commit template with Chinese bracket tags ([新增]/[修复]/[文档])
├── Dockerfile                 # Container image for self-hosting
├── docker-compose.yml         # One-command local/server deployment
├── CONTRIBUTING.md            # Contributor workflow & Chinese commit tag convention
├── LICENSE                    # MIT License
└── .env.example
```

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure AI provider (Optional — works with zero API keys out of the box)**

   Cadence supports three modes automatically:
   - **Zero-Key Local Engine (Default)**: Works immediately without any API key or subscription — supports Paste Text, browser Speech-to-Text microphone recording, accompanying audio uploads, deterministic diarization, sentiment scoring, 3+3 coaching cards, and follow-up coaching replies.
   - **Free Local Ollama / OpenAI-compatible**: Point `LLM_BASE_URL` to your local Ollama server (e.g. `http://localhost:11434/v1`) and set `LLM_MODEL` (plus optional `WHISPER_BASE_URL` for local audio transcription).
   - **Google Gemini**: Set `GEMINI_API_KEY` (Google AI Studio free tier or paid key) for end-to-end audio transcription (`gemini-3.5-transcribe`) and coaching analysis (`gemini-4-hydrogen`).

   ```bash
   cp .env.example .env
   ```

3. **Run in development**

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

4. **Run tests, typecheck, and production build**

   ```bash
   npm test
   npm run lint
   npm run build
   npm start
   ```

## Self-Hosting with Docker

Run Cadence in a container with persistent `./data` storage for call records and uploaded audio:

```bash
cp .env.example .env
# Optional: configure GEMINI_API_KEY or LLM_BASE_URL in .env
docker compose up -d --build
```

The service listens on `http://localhost:3000` with a built-in `/api/health` check.

## Continuous Integration

Every push and pull request targeting `main` runs `.github/workflows/ci.yml` to verify:
- Unit & persistence tests (`npm test`)
- TypeScript checks (`npm run lint`)
- Vite production bundle (`npm run build`)

## Git Commit Convention (中文提交标签)

This repository includes `.gitmessage` and contributor rules in [CONTRIBUTING.md](./CONTRIBUTING.md) using concise Chinese bracket tags: `[新增]`, `[修复]` / `[bug]`, `[更新]`, `[重构]`, `[文档]`, `[测试]`. Enable the template locally with:

```bash
git config commit.template .gitmessage
```

## Node.js API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/capabilities` | Active AI/local provider mode and transcription support |
| `GET` | `/api/calls` | List all persisted sales call records |
| `PATCH` | `/api/calls/:id` | Update speaker labels, turn bookmarks, coach notes, or next-step status |
| `DELETE` | `/api/calls/:id` | Delete a call record and its uploaded audio file |
| `GET` | `/api/audio/:filename` | Stream uploaded audio with HTTP `Range` support |
| `POST` | `/api/transcribe` | Transcribe uploaded or recorded audio via `gemini-3.5-transcribe` or Whisper |
| `POST` | `/api/analyze-call` | Run full diarization, sentiment timeline, and coaching card pipeline |
| `POST` | `/api/coach-chat` | Ask follow-up coaching or email-drafting questions grounded in the call transcript |

## License

MIT — see [LICENSE](./LICENSE).
