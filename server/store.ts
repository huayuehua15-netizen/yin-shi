import type { SalesCallRecord } from '../src/types/call';
import { JsonFileStore, type JsonFileStoreOptions } from './storage/jsonFileStore';
import { resolveDataDir } from './storage/paths';
import type { Store } from './storage/types';

export type { Store } from './storage/types';
export type { JsonFileStoreOptions } from './storage/jsonFileStore';
export { JsonFileStore } from './storage/jsonFileStore';

const stores = new Map<string, Store>();

/**
 * One `Store` per resolved data directory.
 *
 * Reusing the instance keeps its mtime cache and write queue warm; that queue is
 * what stops two concurrent `PATCH` requests from overwriting each other. Routes
 * depend on this interface, not on the JSON file, so swapping in a SQLite
 * adapter is a one-line change here.
 */
export function getStore(baseDir?: string): Store {
  const dataDir = resolveDataDir(baseDir);
  const existing = stores.get(dataDir);
  if (existing) {
    return existing;
  }
  const created = createStore({ baseDir: dataDir });
  stores.set(dataDir, created);
  return created;
}

/** Builds a store that is *not* registered globally (tests, one-off scripts). */
export function createStore(options: JsonFileStoreOptions = {}): Store {
  return new JsonFileStore(options);
}

/**
 * Function facade kept for callers that predate the interface. Every helper
 * resolves the same instance for a given directory, so behaviour is unchanged.
 */
export function readAllCalls(baseDir?: string): Promise<SalesCallRecord[]> {
  return getStore(baseDir).readAll();
}

export function writeAllCalls(calls: SalesCallRecord[], baseDir?: string): Promise<void> {
  return getStore(baseDir).writeAll(calls);
}

export function addCallRecord(
  newCall: SalesCallRecord,
  baseDir?: string
): Promise<SalesCallRecord[]> {
  return getStore(baseDir).add(newCall);
}

export function updateCallRecord(
  id: string,
  updater: (current: SalesCallRecord) => SalesCallRecord,
  baseDir?: string
): Promise<SalesCallRecord | null> {
  return getStore(baseDir).update(id, updater);
}

export function deleteCallRecord(id: string, baseDir?: string): Promise<SalesCallRecord[]> {
  return getStore(baseDir).delete(id);
}

export function saveAudioUpload(
  callId: string,
  originalFilename: string,
  buffer: Buffer,
  baseDir?: string
): Promise<string> {
  return getStore(baseDir).saveAudio(callId, originalFilename, buffer);
}

export function resolveSafeAudioPath(filename: string, baseDir?: string): string | null {
  return getStore(baseDir).resolveAudioPath(filename);
}
