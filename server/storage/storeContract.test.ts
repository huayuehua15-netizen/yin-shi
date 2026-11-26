import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonFileStore } from './jsonFileStore';
import type { Store } from './types';
import type { SalesCallRecord } from '../../src/types/call';

/**
 * The contract every `Store` implementation must satisfy.
 *
 * These tests are written against the interface, not the JSON files, so a
 * SQLite adapter can be dropped in and verified by adding one
 * `withStore(...)` variant to the parameterised runner below.
 */

function buildCall(id: string, overrides: Partial<SalesCallRecord> = {}): SalesCallRecord {
  return {
    id,
    title: `Contract Call ${id}`,
    accountName: 'Contract Co',
    callDate: 'Nov 26, 2026',
    durationSec: 90,
    speakerARole: 'Rep',
    speakerBRole: 'Prospect',
    transcript: [
      {
        id: `${id}-t1`,
        speaker: 'Speaker A',
        speakerLabel: 'Rep',
        startSec: 0,
        endSec: 12,
        text: 'Opening line',
        sentimentScore: 0.4,
      },
    ],
    sentimentTimeline: [{ timeSec: 0, engagement: 60, prospectSentiment: 58, repEnergy: 66 }],
    coaching: {
      summary: 'Steady open.',
      strengths: [
        { title: 'S1', detail: 'D1', evidenceQuote: 'Opening line', timestampSec: 0 },
        { title: 'S2', detail: 'D2', evidenceQuote: 'Opening line', timestampSec: 0 },
        { title: 'S3', detail: 'D3', evidenceQuote: 'Opening line', timestampSec: 0 },
      ],
      missedOpportunities: [
        { title: 'M1', detail: 'D1', evidenceQuote: 'Opening line', timestampSec: 0 },
        { title: 'M2', detail: 'D2', evidenceQuote: 'Opening line', timestampSec: 0 },
        { title: 'M3', detail: 'D3', evidenceQuote: 'Opening line', timestampSec: 0 },
      ],
      nextStepRecommendation: 'Book the follow-up.',
    },
    sourceType: 'transcript',
    ...overrides,
  };
}

const SEED = [buildCall('seed-1'), buildCall('seed-2')];

async function withStore(fn: (store: Store, dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadence-store-contract-'));
  const store = new JsonFileStore({ baseDir: dir, seed: SEED });
  try {
    await fn(store, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('contract: a missing store is seeded once and persisted', async () => {
  await withStore(async (store, dir) => {
    const first = await store.readAll();
    assert.deepEqual(
      first.map((call) => call.id),
      ['seed-1', 'seed-2']
    );

    const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'calls.json'), 'utf-8'));
    assert.equal(onDisk.length, 2);

    const second = await store.readAll();
    assert.equal(second.length, 2, 'a second read must not duplicate the seed');
  });
});

test('contract: writeAll([]) survives restart instead of re-seeding', async () => {
  await withStore(async (store, dir) => {
    await store.readAll();
    await store.writeAll([]);

    const reopened = new JsonFileStore({ baseDir: dir, seed: SEED });
    assert.equal((await reopened.readAll()).length, 0);
  });
});

test('contract: add prepends, update mutates, delete removes', async () => {
  await withStore(async (store) => {
    await store.readAll();

    const added = await store.add(buildCall('new-1'));
    assert.equal(added[0].id, 'new-1');
    assert.equal(added.length, 3);

    const updated = await store.update('new-1', (current) => ({
      ...current,
      title: 'Renamed by contract',
    }));
    assert.equal(updated?.title, 'Renamed by contract');
    assert.equal((await store.readAll())[0].title, 'Renamed by contract');

    const remaining = await store.delete('new-1');
    assert.deepEqual(
      remaining.map((call) => call.id),
      ['seed-1', 'seed-2']
    );
  });
});

test('contract: update returns null for an unknown id', async () => {
  await withStore(async (store) => {
    await store.readAll();
    assert.equal(await store.update('missing', (current) => current), null);
  });
});

test('contract: concurrent adds are serialized without losing records', async () => {
  await withStore(async (store) => {
    await store.readAll();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => store.add(buildCall(`concurrent-${index}`)))
    );
    const calls = await store.readAll();
    assert.equal(calls.length, 2 + 8);
    assert.equal(new Set(calls.map((call) => call.id)).size, calls.length);
  });
});

test('contract: deleting a record also removes its uploaded audio', async () => {
  await withStore(async (store, dir) => {
    const audioUrl = await store.saveAudio('audio-owner', 'segment.WAV', Buffer.from('RIFF'));
    assert.equal(audioUrl, '/api/audio/audio-owner.wav');

    await store.add(buildCall('audio-owner', { audioUrl }));
    const audioPath = store.resolveAudioPath('audio-owner.wav');
    assert.ok(audioPath);
    assert.equal((await fs.stat(audioPath)).size, 4);

    await store.delete('audio-owner');
    await assert.rejects(fs.stat(audioPath), /ENOENT/);

    const leftovers = (await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'atomic writes must not leave temp files behind');
  });
});

test('contract: resolveAudioPath rejects traversal and nested paths', async () => {
  await withStore(async (store) => {
    assert.equal(store.resolveAudioPath('../calls.json'), null);
    assert.equal(store.resolveAudioPath('../../etc/passwd'), null);
    assert.equal(store.resolveAudioPath('nested/file.wav'), null);
    assert.ok(store.resolveAudioPath('ok_1.mp3')?.endsWith(path.join('uploads', 'ok_1.mp3')));
  });
});
