import type { CallRecordPatch, ProviderCapabilities, SalesCallRecord } from '../types/call';

export class ApiError extends Error {
  readonly status: number;
  readonly offline: boolean;

  constructor(message: string, status: number, offline = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.offline = offline;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, signal } = options;

  let response: Response;
  try {
    response = await fetch(path, { method, body, headers, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError('Cannot reach the Cadence server. Check that it is running.', 0, true);
  }

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const payload: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ??
      `Request failed with HTTP ${response.status}.`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  async listCalls(signal?: AbortSignal): Promise<SalesCallRecord[]> {
    const data = await request<{ calls?: SalesCallRecord[] }>('/api/calls', { signal });
    return Array.isArray(data.calls) ? data.calls : [];
  },

  capabilities(signal?: AbortSignal): Promise<ProviderCapabilities> {
    return request<ProviderCapabilities>('/api/capabilities', { signal });
  },

  async updateCall(id: string, patch: CallRecordPatch): Promise<SalesCallRecord> {
    const data = await request<{ call?: SalesCallRecord }>(`/api/calls/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!data.call) {
      throw new ApiError('The server did not return the updated call.', 0);
    }
    return data.call;
  },

  async deleteCall(id: string): Promise<SalesCallRecord[]> {
    const data = await request<{ calls?: SalesCallRecord[] }>(
      `/api/calls/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    return Array.isArray(data.calls) ? data.calls : [];
  },

  async transcribe(form: FormData, signal?: AbortSignal): Promise<string> {
    const data = await request<{ transcriptText?: string }>('/api/transcribe', {
      method: 'POST',
      body: form,
      signal,
    });
    if (!data.transcriptText) {
      throw new ApiError('Transcription returned no text.', 0);
    }
    return data.transcriptText;
  },

  async analyzeCall(
    payload: FormData | Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<SalesCallRecord> {
    const isForm = payload instanceof FormData;
    const data = await request<{ call?: SalesCallRecord }>('/api/analyze-call', {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? payload : JSON.stringify(payload),
      signal,
    });
    if (!data.call) {
      throw new ApiError('Analysis returned no call record.', 0);
    }
    return data.call;
  },

  async coachChat(call: SalesCallRecord, question: string, locale: 'en' | 'zh'): Promise<string> {
    const data = await postJson<{ reply?: string }>('/api/coach-chat', {
      call,
      question,
      locale,
    });
    if (!data.reply) {
      throw new ApiError('The coach returned an empty reply.', 0);
    }
    return data.reply;
  },
};

export type CadenceApi = typeof api;
