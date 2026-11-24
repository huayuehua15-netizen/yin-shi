import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, api } from './client';
import type { SalesCallRecord } from '../types/call';

const SAMPLE_CALL = { id: 'call-1', title: 'Renewal' } as SalesCallRecord;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    requests.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;

  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('listCalls unwraps the calls envelope', async () => {
  const mock = mockFetch(() => jsonResponse({ calls: [SAMPLE_CALL] }));
  try {
    const calls = await api.listCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'call-1');
    assert.equal(mock.requests[0].url, '/api/calls');
  } finally {
    mock.restore();
  }
});

test('listCalls tolerates a missing calls array', async () => {
  const mock = mockFetch(() => jsonResponse({}));
  try {
    assert.deepEqual(await api.listCalls(), []);
  } finally {
    mock.restore();
  }
});

test('a non-2xx JSON response becomes an ApiError with the server message', async () => {
  const mock = mockFetch(() => jsonResponse({ error: 'Call record not found.' }, 404));
  try {
    await assert.rejects(
      () => api.updateCall('missing', { title: 'New' }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 404);
        assert.equal(err.message, 'Call record not found.');
        return true;
      }
    );
  } finally {
    mock.restore();
  }
});

test('a network failure is reported as an offline ApiError', async () => {
  const mock = mockFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  try {
    await assert.rejects(
      () => api.listCalls(),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.offline, true);
        assert.equal(err.status, 0);
        return true;
      }
    );
  } finally {
    mock.restore();
  }
});

test('updateCall requires the call envelope', async () => {
  const mock = mockFetch(() => jsonResponse({}));
  try {
    await assert.rejects(() => api.updateCall('call-1', { title: 'Renewal' }), ApiError);
  } finally {
    mock.restore();
  }
});

test('coachChat posts the call, question, and locale as JSON', async () => {
  const mock = mockFetch(() => jsonResponse({ reply: 'Ask about budget.' }));
  try {
    const reply = await api.coachChat(SAMPLE_CALL, 'What should I ask next?', 'zh');
    assert.equal(reply, 'Ask about budget.');

    const request = mock.requests[0];
    assert.equal(request.url, '/api/coach-chat');
    assert.equal(request.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
      call: SAMPLE_CALL,
      question: 'What should I ask next?',
      locale: 'zh',
    });
  } finally {
    mock.restore();
  }
});

test('analyzeCall leaves multipart uploads to the browser', async () => {
  const mock = mockFetch(() => jsonResponse({ call: SAMPLE_CALL }));
  try {
    const form = new FormData();
    form.append('title', 'Live call');

    const call = await api.analyzeCall(form);
    assert.equal(call.id, 'call-1');

    const request = mock.requests[0];
    assert.equal(request.url, '/api/analyze-call');
    assert.equal(request.init?.body, form);
    const headers = request.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.['Content-Type'], undefined);
  } finally {
    mock.restore();
  }
});

test('analyzeCall sends JSON payloads with an explicit content type', async () => {
  const mock = mockFetch(() => jsonResponse({ call: SAMPLE_CALL }));
  try {
    await api.analyzeCall({ rawTranscript: 'Rep: hello', sourceType: 'transcript' });

    const request = mock.requests[0];
    const headers = request.init?.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(String(request.init?.body)), {
      rawTranscript: 'Rep: hello',
      sourceType: 'transcript',
    });
  } finally {
    mock.restore();
  }
});
