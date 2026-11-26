import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SAMPLE_CALLS } from '../../src/data/sampleCalls';
import type { SalesCallRecord } from '../../src/types/call';
import { resolveDataDir, resolveStorePaths, type StorePaths } from './paths';
import type { Store } from './types';

interface CacheEntry {
  calls: SalesCallRecord[];
  mtimeMs: number;
}

export interface JsonFileStoreOptions {
  /** Directory override; defaults to `CADENCE_DATA_DIR` or `<cwd>/data`. */
  baseDir?: string;
  /** Records written when the store does not exist yet. Defaults to the demo calls. */
  seed?: SalesCallRecord[];
}

/**
 * Single-process JSON persistence with the properties the API depends on:
 *
 * - **Atomic writes**: temp file + rename, so a crash never leaves half a file.
 * - **Serialized read-modify-write**: two concurrent `PATCH`es cannot overwrite
 *   each other's fields.
 * - **mtime cache**: repeated reads skip parsing unless the file changed on disk.
 * - **Corruption quarantine**: unparsable bytes are renamed aside, never deleted.
 * - **Explicit empty state**: `writeAll([])` survives restarts; only a *missing*
 *   file is seeded.
 */
export class JsonFileStore implements Store {
  readonly dataDir: string;
  private readonly paths: StorePaths;
  private readonly seed: SalesCallRecord[];
  private cache: CacheEntry | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: JsonFileStoreOptions = {}) {
    this.dataDir = resolveDataDir(options.baseDir);
    this.paths = resolveStorePaths(this.dataDir);
    this.seed = options.seed ?? SAMPLE_CALLS;
  }

  async readAll(): Promise<SalesCallRecord[]> {
    await this.ensureDirectories();

    if (this.cache) {
      const stat = await fs.stat(this.paths.callsFile).catch(() => null);
      if (stat && stat.mtimeMs === this.cache.mtimeMs) {
        return [...this.cache.calls];
      }
      this.cache = null;
    }

    const snapshot = await this.readSnapshot();
    if (snapshot) {
      this.cache = { calls: [...snapshot.calls], mtimeMs: snapshot.mtimeMs };
      return [...snapshot.calls];
    }

    // Missing or unreadable store: seed exactly once, even under concurrent reads.
    return this.serialize(async () => {
      const again = await this.readSnapshot();
      if (again) {
        this.cache = { calls: [...again.calls], mtimeMs: again.mtimeMs };
        return [...again.calls];
      }
      await this.persist(this.seed);
      return [...this.seed];
    });
  }

  async writeAll(calls: SalesCallRecord[]): Promise<void> {
    await this.ensureDirectories();
    await this.serialize(() => this.persist(calls));
  }

  async add(newCall: SalesCallRecord): Promise<SalesCallRecord[]> {
    await this.ensureDirectories();
    // Resolve the initial seed outside the write lock; otherwise the seed path
    // would re-enter the same queue and deadlock.
    await this.readAll();
    return this.serialize(async () => {
      const existing = await this.readAll();
      const updated = [newCall, ...existing.filter((call) => call.id !== newCall.id)];
      await this.persist(updated);
      return updated;
    });
  }

  async update(
    id: string,
    updater: (current: SalesCallRecord) => SalesCallRecord
  ): Promise<SalesCallRecord | null> {
    await this.ensureDirectories();
    await this.readAll();
    return this.serialize(async () => {
      const calls = await this.readAll();
      const index = calls.findIndex((call) => call.id === id);
      if (index === -1) {
        return null;
      }
      const updatedCall = updater(calls[index]);
      calls[index] = updatedCall;
      await this.persist(calls);
      return updatedCall;
    });
  }

  async delete(id: string): Promise<SalesCallRecord[]> {
    await this.ensureDirectories();
    await this.readAll();
    return this.serialize(async () => {
      const calls = await this.readAll();
      const target = calls.find((call) => call.id === id);
      const remaining = calls.filter((call) => call.id !== id);
      await this.persist(remaining);

      if (target?.audioUrl?.startsWith('/api/audio/')) {
        const safeName = path.basename(target.audioUrl);
        await fs.unlink(path.join(this.paths.uploadsDir, safeName)).catch(() => undefined);
      }

      return remaining;
    });
  }

  async saveAudio(callId: string, originalFilename: string, buffer: Buffer): Promise<string> {
    await this.ensureDirectories();
    const rawExt = path.extname(originalFilename || '').toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : '.webm';
    const safeFilename = `${callId.replace(/[^a-zA-Z0-9_-]/g, '')}${safeExt}`;
    await fs.writeFile(path.join(this.paths.uploadsDir, safeFilename), buffer);
    return `/api/audio/${safeFilename}`;
  }

  resolveAudioPath(filename: string): string | null {
    const safeBase = path.basename(filename);
    if (!safeBase || safeBase !== filename) {
      return null;
    }
    const fullPath = path.resolve(this.paths.uploadsDir, safeBase);
    if (!fullPath.startsWith(this.paths.uploadsDir + path.sep)) {
      return null;
    }
    return fullPath;
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.paths.dataDir, { recursive: true });
    await fs.mkdir(this.paths.uploadsDir, { recursive: true });
  }

  /** Runs tasks one at a time; a rejection does not poison the queue. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async readSnapshot(): Promise<{ calls: SalesCallRecord[]; mtimeMs: number } | null> {
    let raw: string;
    let mtimeMs: number;
    try {
      const [contents, stat] = await Promise.all([
        fs.readFile(this.paths.callsFile, 'utf-8'),
        fs.stat(this.paths.callsFile),
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
      const backup = `${this.paths.callsFile}.corrupt-${Date.now()}`;
      await fs.rename(this.paths.callsFile, backup).catch(() => undefined);
      return null;
    }
  }

  /** Writes the full store atomically: temp file first, then an atomic rename. */
  private async persist(calls: SalesCallRecord[]): Promise<void> {
    const tempFile = `${this.paths.callsFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempFile, JSON.stringify(calls, null, 2), 'utf-8');
      await fs.rename(tempFile, this.paths.callsFile);
    } finally {
      await fs.rm(tempFile, { force: true }).catch(() => undefined);
    }

    const stat = await fs.stat(this.paths.callsFile).catch(() => null);
    this.cache = {
      calls: [...calls],
      mtimeMs: stat?.mtimeMs ?? Date.now(),
    };
  }
}
