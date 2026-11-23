import fs from 'fs/promises';
import path from 'path';
import { SAMPLE_CALLS } from '../src/data/sampleCalls';
import type { SalesCallRecord } from '../src/types/call';

function getPaths(baseDir?: string) {
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

async function ensureDirectories(baseDir?: string): Promise<ReturnType<typeof getPaths>> {
  const paths = getPaths(baseDir);
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.uploadsDir, { recursive: true });
  return paths;
}

export async function readAllCalls(baseDir?: string): Promise<SalesCallRecord[]> {
  const { callsFile } = await ensureDirectories(baseDir);
  try {
    const raw = await fs.readFile(callsFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as SalesCallRecord[];
    }
  } catch {
    // Seed initial file if missing or empty
  }

  await writeAllCalls(SAMPLE_CALLS, baseDir);
  return SAMPLE_CALLS;
}

export async function writeAllCalls(calls: SalesCallRecord[], baseDir?: string): Promise<void> {
  const { callsFile } = await ensureDirectories(baseDir);
  await fs.writeFile(callsFile, JSON.stringify(calls, null, 2), 'utf-8');
}

export async function addCallRecord(
  newCall: SalesCallRecord,
  baseDir?: string
): Promise<SalesCallRecord[]> {
  const existing = await readAllCalls(baseDir);
  const updated = [newCall, ...existing.filter((c) => c.id !== newCall.id)];
  await writeAllCalls(updated, baseDir);
  return updated;
}

export async function updateCallRecord(
  id: string,
  updater: (current: SalesCallRecord) => SalesCallRecord,
  baseDir?: string
): Promise<SalesCallRecord | null> {
  const calls = await readAllCalls(baseDir);
  const index = calls.findIndex((c) => c.id === id);
  if (index === -1) {
    return null;
  }
  const updatedCall = updater(calls[index]);
  calls[index] = updatedCall;
  await writeAllCalls(calls, baseDir);
  return updatedCall;
}

export async function deleteCallRecord(id: string, baseDir?: string): Promise<SalesCallRecord[]> {
  const { uploadsDir } = getPaths(baseDir);
  const calls = await readAllCalls(baseDir);
  const target = calls.find((c) => c.id === id);
  const remaining = calls.filter((c) => c.id !== id);
  await writeAllCalls(remaining, baseDir);

  if (target?.audioUrl && target.audioUrl.startsWith('/api/audio/')) {
    const safeName = path.basename(target.audioUrl);
    const filePath = path.join(uploadsDir, safeName);
    await fs.unlink(filePath).catch(() => {});
  }

  return remaining;
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
