/**
 * On Windows, `0.0.0.0:3000` and `127.0.0.1:3000` can be bound by two different
 * processes at the same time. Our own listener starts fine, but `localhost` is
 * then answered by whoever owns the more specific loopback address, so the
 * browser silently shows a different project. This probe catches that case.
 */
export async function detectForeignListener(
  port: number,
  version: string,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const hint = `Another project owns the loopback address, so localhost would show it instead. Start on another port, for example: PORT=${port + 1} npm run dev`;

  try {
    const response = await fetcher(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return `127.0.0.1:${port} answers with HTTP ${response.status}, not with this server's health endpoint. ${hint}`;
    }

    const body = (await response.json()) as { ok?: boolean; version?: string };
    if (body.ok === true && body.version === version) {
      return null;
    }

    return `127.0.0.1:${port} reports health version ${body.version ?? 'unknown'} instead of ${version}. ${hint}`;
  } catch {
    // Nothing answered on loopback, so there is no foreign owner to warn about.
    return null;
  }
}
