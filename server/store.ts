import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SAMPLE_CALLS } from '../src/data/sampleCalls';
import type { SalesCallRecord } from '../src/types/call';

interface StorePaths {
  dataDir: string;
  callsFile: string;
  uploadsDir: string;
}

interface CacheEntry {
  calls: SalesCallRecord[];
  mtimeMs: number;
}

const readCache = new Map<string, CacheEntry>();
const writeQueues = new Map<string, Promise<unknown>>();

function getPaths(baseDir?: string): StorePaths {
  const dataDir = baseDir
    ? path.resolve(baseDir)
    : process.env.CADENCE_DATA_DIR
      ? path.resolve(process.env.CADENCE_DATA_DIR)
      : path.resolve(process.cwd(), 'data');

  return {
    dataDir,
    callsFile: path.join(dataDir, 'calls.json'),
    uploadsDir: path.join(dataDir, 'uploads'),
  };
}

async function ensureDirectories(baseDir?: string): Promise<StorePaths> {
  const paths = getPaths(baseDir);
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  return paths;
}

/**
 * Serializes read-modify-write cycles for a given `calls.json`.
 *
 * The API runs in a single process, but two concurrent `PATCH` requests would
 * otherwise read the same snapshot and silently overwrite each other's fields.
 */
function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const result = previous.then(task, task);
  writeQueues.set(
    key,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

async function readSnapshot(
  paths: StorePaths
): Promise<{ calls: SalesCallRecord[]; mtimeMs: number } | null> {
  let raw: string;
  let mtimeMs: number;
  try {
    const [contents, stat] = await Promise.all([
      fs.readFile(paths.callsFile, 'utf-8'),
      fs.stat(paths.callsFile),
    ]);
    raw = contents;
    mtimeMs = stat.mtimeMs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('calls.json must contain a JSON array');
    }
    return { calls: parsed as SalesCallRecord[], mtimeMs };
  } catch {
    // Never destroy a corrupted store: keep the bytes for manual recovery.
    const backup = `${paths.callsFile}.corrupt-${Date.now()}`;
    await fs.rename(paths.callsFile, backup).catch(() => undefined);
    return null;
  }
}

/** Writes the full store atomically: temp file first, then an atomic rename. */
async function persist(paths: StorePaths, calls: SalesCallRecord[]): Promise<void> {
  const tempFile = `${paths.callsFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempFile, JSON.stringify(calls, null, 2), 'utf-8');
    await fs.rename(tempFile, paths.callsFile);
  } finally {
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
  }

  const stat = await fs.stat(paths.callsFile).catch(() => null);
  readCache.set(paths.callsFile, {
    calls: [...calls],
    mtimeMs: stat?.mtimeMs ?? Date.now(),
  });
}

export async function readAllCalls(baseDir?: string): Promise<SalesCallRecord[]> {
  const paths = await ensureDirectories(baseDir);

  const cached = readCache.get(paths.callsFile);
  if (cached) {
    const stat = await fs.stat(paths.callsFile).catch(() => null);
    if (stat && stat.mtimeMs === cached.mtimeMs) {
      return [...cached.calls];
    }
    readCache.delete(paths.callsFile);
  }

  const snapshot = await readSnapshot(paths);
  if (snapshot) {
    readCache.set(paths.callsFile, { calls: [...snapshot.calls], mtimeMs: snapshot.mtimeMs });
    return [...snapshot.calls];
  }

  // Missing or unreadable store: seed exactly once, even under concurrent reads.
  return serialize(paths.callsFile, async () => {
    const again = await readSnapshot(paths);
    if (again) {
      readCache.set(paths.callsFile, { calls: [...again.calls], mtimeMs: again.mtimeMs });
      return [...again.calls];
    }
    await persist(paths, SAMPLE_CALLS);
    return [...SAMPLE_CALLS];
  });
}

export async function writeAllCalls(calls: SalesCallRecord[], baseDir?: string): Promise<void> {
  const paths = await ensureDirectories(baseDir);
  await serialize(paths.callsFile, () => persist(paths, calls));
}

export async function addCallRecord(
  newCall: SalesCallRecord,
  baseDir?: string
): Promise<SalesCallRecord[]> {
  const paths = await ensureDirectories(baseDir);
  // Resolve the initial seed outside the write lock; otherwise the seed path
  // would re-enter the same queue and deadlock.
  await readAllCalls(baseDir);
  return serialize(paths.callsFile, async () => {
    const existing = await readAllCalls(baseDir);
    const updated = [newCall, ...existing.filter((c) => c.id !== newCall.id)];
    await persist(paths, updated);
    return updated;
  });
}

export async function updateCallRecord(
  id: string,
  updater: (current: SalesCallRecord) => SalesCallRecord,
  baseDir?: string
): Promise<SalesCallRecord | null> {
  const paths = await ensureDirectories(baseDir);
  await readAllCalls(baseDir);
  return serialize(paths.callsFile, async () => {
    const calls = await readAllCalls(baseDir);
    const index = calls.findIndex((c) => c.id === id);
    if (index === -1) {
      return null;
    }
    const updatedCall = updater(calls[index]);
    calls[index] = updatedCall;
    await persist(paths, calls);
    return updatedCall;
  });
}

export async function deleteCallRecord(id: string, baseDir?: string): Promise<SalesCallRecord[]> {
  const paths = await ensureDirectories(baseDir);
  await readAllCalls(baseDir);
  return serialize(paths.callsFile, async () => {
    const calls = await readAllCalls(baseDir);
    const target = calls.find((c) => c.id === id);
    const remaining = calls.filter((c) => c.id !== id);
    await persist(paths, remaining);

    if (target?.audioUrl?.startsWith('/api/audio/')) {
      const safeName = path.basename(target.audioUrl);
      const filePath = path.join(paths.uploadsDir, safeName);
      await fs.unlink(filePath).catch(() => undefined);
    }

    return remaining;
  });
}

export async function saveAudioUpload(
  callId: string,
  originalFilename: string,
  buffer: Buffer,
  baseDir?: string
): Promise<string> {
  const { uploadsDir } = await ensureDirectories(baseDir);
  const rawExt = path.extname(originalFilename || '').toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : '.webm';
  const safeFilename = `${callId.replace(/[^a-zA-Z0-9_-]/g, '')}${safeExt}`;
  const fullPath = path.join(uploadsDir, safeFilename);
  await fs.writeFile(fullPath, buffer);
  return `/api/audio/${safeFilename}`;
}

export function resolveSafeAudioPath(filename: string, baseDir?: string): string | null {
  const { uploadsDir } = getPaths(baseDir);
  const safeBase = path.basename(filename);
  if (!safeBase || safeBase !== filename) {
    return null;
  }
  const fullPath = path.resolve(uploadsDir, safeBase);
  if (!fullPath.startsWith(uploadsDir + path.sep)) {
    return null;
  }
  return fullPath;
}
