import type { SalesCallRecord } from '../../src/types/call';

/**
 * The persistence seam.
 *
 * Routes and the ingestion pipeline talk to this interface only. `JsonFileStore`
 * is the zero-dependency implementation; a SQLite or Postgres adapter can be
 * dropped in later without touching HTTP code, and must pass
 * `storeContract.test.ts` before it is considered a valid replacement.
 */
export interface Store {
  /** All records, newest first. An empty store is seeded once, never repeatedly. */
  readAll(): Promise<SalesCallRecord[]>;

  /** Replaces the whole collection. Used to express "intentionally empty". */
  writeAll(calls: SalesCallRecord[]): Promise<void>;

  /** Prepends a record, replacing any existing record with the same id. */
  add(call: SalesCallRecord): Promise<SalesCallRecord[]>;

  /** Read-modify-write under a per-store lock; `null` when the id is unknown. */
  update(
    id: string,
    updater: (current: SalesCallRecord) => SalesCallRecord
  ): Promise<SalesCallRecord | null>;

  /** Removes the record and its uploaded audio, returning the remaining records. */
  delete(id: string): Promise<SalesCallRecord[]>;

  /** Persists an upload and returns the public `/api/audio/...` URL. */
  saveAudio(callId: string, originalFilename: string, buffer: Buffer): Promise<string>;

  /** Resolves a public audio filename to a path inside the uploads dir, or null. */
  resolveAudioPath(filename: string): string | null;
}
