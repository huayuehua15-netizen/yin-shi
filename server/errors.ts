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
