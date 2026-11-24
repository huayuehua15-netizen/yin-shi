import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addCallRecord,
  deleteCallRecord,
  readAllCalls,
  resolveSafeAudioPath,
  saveAudioUpload,
  updateCallRecord,
  writeAllCalls,
} from './store';
import type { SalesCallRecord } from '../src/types/call';

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadence-store-test-'));
  try {
    await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function buildCall(id: string, overrides: Partial<SalesCallRecord> = {}): SalesCallRecord {
  return {
    id,
    title: `Test Discovery ${id}`,
    accountName: 'Beta Inc',
    callDate: 'Nov 22, 2026',
    durationSec: 120,
    speakerARole: 'Alex (AE)',
    speakerBRole: 'Sam (VP)',
    transcript: [
      {
        id: 't1',
        speaker: 'Speaker A',
        speakerLabel: 'Alex (AE)',
        startSec: 0,
        endSec: 15,
        text: 'Hello Sam',
        sentimentScore: 0.5,
      },
    ],
    sentimentTimeline: [{ timeSec: 0, engagement: 70, prospectSentiment: 65, repEnergy: 72 }],
    coaching: {
      summary: 'Good start.',
      strengths: [
        { title: 'S1', detail: 'D1', evidenceQuote: 'Hello Sam', timestampSec: 0 },
        { title: 'S2', detail: 'D2', evidenceQuote: 'Hello Sam', timestampSec: 0 },
        { title: 'S3', detail: 'D3', evidenceQuote: 'Hello Sam', timestampSec: 0 },
      ],
      missedOpportunities: [
        { title: 'M1', detail: 'D1', evidenceQuote: 'Hello Sam', timestampSec: 0 },
        { title: 'M2', detail: 'D2', evidenceQuote: 'Hello Sam', timestampSec: 0 },
        { title: 'M3', detail: 'D3', evidenceQuote: 'Hello Sam', timestampSec: 0 },
      ],
      nextStepRecommendation: 'Send recap.',
    },
    sourceType: 'uploaded',
    ...overrides,
  };
}

test('readAllCalls seeds initial sample calls when store is empty', async () => {
  await withTempDir(async (dir) => {
    const calls = await readAllCalls(dir);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].id, 'call-acme-q4');
  });
});

test('addCallRecord, updateCallRecord, and deleteCallRecord persist CRUD changes', async () => {
  await withTempDir(async (dir) => {
    const audioUrl = await saveAudioUpload('call-test-1', 'demo.wav', Buffer.from('RIFF'), dir);
    assert.equal(audioUrl, '/api/audio/call-test-1.wav');

    const newCall = buildCall('call-test-1', { audioUrl, title: 'Test Discovery' });

    const afterAdd = await addCallRecord(newCall, dir);
    assert.equal(afterAdd.length, 4);
    assert.equal(afterAdd[0].id, 'call-test-1');

    const updated = await updateCallRecord(
      'call-test-1',
      (curr) => ({ ...curr, title: 'Updated Discovery' }),
      dir
    );
    assert.equal(updated?.title, 'Updated Discovery');

    const afterDelete = await deleteCallRecord('call-test-1', dir);
    assert.equal(afterDelete.length, 3);

    const savedAudioPath = resolveSafeAudioPath('call-test-1.wav', dir);
    assert.ok(savedAudioPath);
    await assert.rejects(fs.access(savedAudioPath!));
  });
});

test('resolveSafeAudioPath blocks path traversal attempts', () => {
  assert.equal(resolveSafeAudioPath('../calls.json'), null);
  assert.equal(resolveSafeAudioPath('../../etc/passwd'), null);
  assert.equal(resolveSafeAudioPath('subdir/file.wav'), null);
  assert.ok(
    resolveSafeAudioPath('valid-call_1.mp3')?.endsWith(path.join('uploads', 'valid-call_1.mp3'))
  );
});

test('an intentionally empty store stays empty instead of re-seeding samples', async () => {
  await withTempDir(async (dir) => {
    await readAllCalls(dir);
    await writeAllCalls([], dir);

    const calls = await readAllCalls(dir);
    assert.equal(calls.length, 0);

    // A fresh read (cache bypassed) must observe the same persisted state.
    await fs.utimes(path.join(dir, 'calls.json'), new Date(), new Date());
    assert.equal((await readAllCalls(dir)).length, 0);
  });
});

test('concurrent addCallRecord calls are serialized without losing records', async () => {
  await withTempDir(async (dir) => {
    await readAllCalls(dir);

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        addCallRecord(buildCall(`call-concurrent-${index}`), dir)
      )
    );

    const calls = await readAllCalls(dir);
    assert.equal(calls.length, 11);
    assert.equal(new Set(calls.map((call) => call.id)).size, 11);

    const entries = await fs.readdir(dir);
    assert.equal(
      entries.some((entry) => entry.endsWith('.tmp')),
      false,
      'atomic writes must not leave temporary files behind'
    );
  });
});

test('concurrent updates to different fields both survive', async () => {
  await withTempDir(async (dir) => {
    const call = buildCall('call-race');
    await addCallRecord(call, dir);

    await Promise.all([
      updateCallRecord('call-race', (current) => ({ ...current, title: 'Renamed' }), dir),
      updateCallRecord('call-race', (current) => ({ ...current, accountName: 'Gamma Ltd' }), dir),
    ]);

    const saved = (await readAllCalls(dir)).find((item) => item.id === 'call-race');
    assert.equal(saved?.title, 'Renamed');
    assert.equal(saved?.accountName, 'Gamma Ltd');
  });
});

test('a corrupted calls.json is backed up and reseeded instead of crashing', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'calls.json'), '{ this is not json', 'utf-8');

    const calls = await readAllCalls(dir);
    assert.equal(calls.length, 3);

    const entries = await fs.readdir(dir);
    assert.ok(
      entries.some((entry) => entry.includes('.corrupt-')),
      'corrupt payload is preserved'
    );
  });
});
