/**
 * A provider answering 503 / UNAVAILABLE is an availability problem, not a bad
 * request. In that case the deterministic local engine takes over instead of
 * surfacing a 500 to the user.
 */
export function isProviderUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  return message.includes('503') || message.includes('UNAVAILABLE');
}

export async function withLocalFallback<T>(
  primary: () => Promise<T>,
  fallback: () => T | Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    if (!isProviderUnavailable(err)) throw err;
    return fallback();
  }
}
