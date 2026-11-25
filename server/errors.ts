/**
 * Maps provider failures onto HTTP status codes so routes can stay small and
 * clients get actionable messages instead of a generic 500.
 */
export function extractErrorDetails(err: unknown): { status: number; message: string } {
  if (err instanceof Error) {
    const msg = err.message || 'Unexpected server error';
    if (msg.includes('GEMINI_API_KEY')) {
      return { status: 400, message: msg };
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
      return {
        status: 403,
        message: 'Invalid or unauthorized Gemini API key. Please check Settings > Secrets.',
      };
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      return {
        status: 429,
        message: 'Gemini API rate limit or quota reached. Please retry shortly.',
      };
    }
    return { status: 500, message: msg };
  }
  return { status: 500, message: 'Unexpected error processing audio.' };
}

/**
 * Turns the two failures a fresh `npm run dev` actually hits into something the
 * reader can act on, instead of a bare Node stack trace. Returns null for
 * errors that carry no useful hint.
 */
export function describeListenError(err: NodeJS.ErrnoException, port: number): string | null {
  if (err.code === 'EADDRINUSE') {
    return `Port ${port} is already in use — another project or an old dev server owns it. Start on another port instead, for example: PORT=${port + 1} npm run dev`;
  }
  if (err.code === 'EACCES') {
    return `Port ${port} requires elevated privileges. Pick a port above 1024 instead.`;
  }
  return null;
}
