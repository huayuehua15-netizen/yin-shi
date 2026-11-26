import path from 'node:path';

/** Absolute locations a store implementation needs, resolved once per instance. */
export interface StorePaths {
  dataDir: string;
  callsFile: string;
  uploadsDir: string;
}

/**
 * Data directory precedence: an explicit argument (tests, scripts), then
 * `CADENCE_DATA_DIR`, then `<cwd>/data` for a zero-configuration start.
 */
export function resolveDataDir(baseDir?: string): string {
  if (baseDir) {
    return path.resolve(baseDir);
  }
  if (process.env.CADENCE_DATA_DIR) {
    return path.resolve(process.env.CADENCE_DATA_DIR);
  }
  return path.resolve(process.cwd(), 'data');
}

export function resolveStorePaths(dataDir: string): StorePaths {
  return {
    dataDir,
    callsFile: path.join(dataDir, 'calls.json'),
    uploadsDir: path.join(dataDir, 'uploads'),
  };
}
