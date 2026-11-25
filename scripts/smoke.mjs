#!/usr/bin/env node
/**
 * End-to-end smoke test for the Cadence server.
 *
 * Boots the real server against a throwaway data directory, then exercises the
 * contract a reviewer actually touches: static hosting, health, persistence,
 * the zero-key analysis pipeline, and the guard rails. No browser, no API key.
 *
 * Usage: node scripts/smoke.mjs   (requires `npm run build` first)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'cadence-smoke-'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const results = [];
let createdId = null;

async function check(name, fn) {
  try {
    await fn();
    results.push({ ok: true, name });
  } catch (error) {
    results.push({ ok: false, name, detail: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  return { response, payload };
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    CADENCE_DATA_DIR: dataDir,
    CADENCE_PROVIDER: 'local',
    GEMINI_API_KEY: '',
    LLM_BASE_URL: '',
    WHISPER_BASE_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (chunk) => (serverLog += chunk.toString()));
server.stderr.on('data', (chunk) => (serverLog += chunk.toString()));

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await sleep(400);
  }
  throw new Error(`Server did not become healthy.\n${serverLog.slice(-800)}`);
}

let exitCode = 0;

try {
  await waitForHealth();

  await check('GET / serves the built app shell', async () => {
    const response = await fetch(`${BASE}/`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    const html = await response.text();
    assert(html.includes('id="root"'), 'app root element missing (did you run npm run build?)');
    assert(html.includes('og:image'), 'social preview metadata missing');
  });

  await check('Referenced JS asset is served', async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert(match, 'no bundled script found in the app shell');
    const asset = await fetch(`${BASE}${match[1]}`);
    assert(asset.status === 200, `asset ${match[1]} returned ${asset.status}`);
  });

  await check('GET /api/health reports the package version', async () => {
    const { response, payload } = await json('/api/health');
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(payload?.ok === true, 'health.ok is not true');
    assert(payload?.version === pkg.version, `version ${payload?.version} != ${pkg.version}`);
    assert(typeof payload?.uptimeSec === 'number', 'uptimeSec missing');
  });

  await check('GET /api/capabilities exposes the provider mode', async () => {
    const { response, payload } = await json('/api/capabilities');
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(typeof payload?.llmProvider === 'string', 'llmProvider missing from capabilities');
    assert(payload.llmProvider === 'local', `forced local mode returned ${payload.llmProvider}`);
    assert(payload.audioTranscription === false, 'local mode should not claim audio transcription');
  });

  await check('GET /api/calls returns a list', async () => {
    const { response, payload } = await json('/api/calls');
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(Array.isArray(payload?.calls), 'calls is not an array');
  });

  await check('POST /api/analyze-call runs the zero-key pipeline', async () => {
    const { response, payload } = await json('/api/analyze-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Smoke Test Renewal Call',
        accountName: 'Smoke Test Co',
        speakerARole: 'Account Executive',
        speakerBRole: 'VP Operations',
        methodology: 'MEDDPICC',
        callStage: 'Renewal & Expansion',
        sourceType: 'transcript',
        analysisEngine: 'local',
        rawTranscript: [
          '[00:00] Sales Rep: Thanks for making time today — I want to focus on the renewal and the rollout timeline.',
          '[00:20] Prospect: We are still worried about the 18% price increase and the migration window.',
          '[00:50] Sales Rep: Understood. Let us look at phasing the rollout and locking the discount before Q1.',
          '[01:10] Prospect: If you can hold pricing through the first quarter, we can sign by Friday.',
        ].join('\n'),
      }),
    });

    assert(response.status === 200, `expected 200, got ${response.status}`);
    const call = payload?.call;
    assert(call?.id, 'analysis returned no call id');
    assert(Array.isArray(call.transcript) && call.transcript.length > 0, 'transcript is empty');
    assert(
      Array.isArray(call.sentimentTimeline) && call.sentimentTimeline.length > 0,
      'timeline empty'
    );
    assert(
      Array.isArray(call.coaching?.strengths) && call.coaching.strengths.length === 3,
      'coaching card does not contain 3 strengths'
    );
    assert(call.coaching.nextStepRecommendation, 'missing next step recommendation');
    createdId = call.id;
  });

  await check('PATCH /api/calls/:id persists the next-step state', async () => {
    assert(createdId, 'no call to patch (analysis step failed)');
    const { response, payload } = await json(`/api/calls/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextStepCompleted: true }),
    });
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(payload?.call?.coaching?.nextStepCompleted === true, 'patch not applied');

    const listed = await json('/api/calls');
    const persisted = listed.payload?.calls?.find((call) => call.id === createdId);
    assert(persisted?.coaching?.nextStepCompleted === true, 'patch did not survive a re-read');
  });

  await check('Unknown API routes return JSON 404', async () => {
    const { response, payload } = await json('/api/definitely-not-a-route');
    assert(response.status === 404, `expected 404, got ${response.status}`);
    assert(typeof payload?.error === 'string', '404 body is not JSON with an error message');
  });

  await check('Audio route rejects path traversal', async () => {
    const response = await fetch(`${BASE}/api/audio/..%2F..%2Fserver.ts`);
    assert(response.status >= 400, `traversal returned ${response.status}`);
  });

  await check('DELETE /api/calls/:id removes the record', async () => {
    assert(createdId, 'no call to delete');
    const { response, payload } = await json(`/api/calls/${createdId}`, { method: 'DELETE' });
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(
      !payload?.calls?.some((call) => call.id === createdId),
      'deleted call is still in the response'
    );
  });

  await check('X-Request-Id is echoed on every response', async () => {
    const response = await fetch(`${BASE}/api/health`);
    assert(response.headers.get('x-request-id'), 'missing X-Request-Id header');
  });
} catch (error) {
  results.push({ ok: false, name: 'server bootstrap', detail: error.message });
} finally {
  server.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows can hold the handle briefly; the temp directory is disposable.
  }
}

const failures = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `\n      ${result.detail}` : ''}`
  );
}
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);

if (failures.length > 0) exitCode = 1;
process.exit(exitCode);
