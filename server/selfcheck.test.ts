import test from 'node:test';
import assert from 'node:assert/strict';
import { detectForeignListener } from './selfcheck';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('detectForeignListener stays quiet when loopback answers as this server', async () => {
  const fetcher = (async () => jsonResponse({ ok: true, version: '1.3.3' })) as typeof fetch;
  assert.equal(await detectForeignListener(3100, '1.3.3', fetcher), null);
});

test('detectForeignListener flags a different server on loopback', async () => {
  const fetcher = (async () => jsonResponse({ ok: true, version: '0.2.0' })) as typeof fetch;
  const warning = await detectForeignListener(3000, '1.3.3', fetcher);
  assert.ok(warning);
  assert.match(warning!, /health version 0\.2\.0 instead of 1\.3\.3/);
  assert.match(warning!, /PORT=3001/);
});

test('detectForeignListener flags a non-health response on loopback', async () => {
  const fetcher = (async () => jsonResponse({ error: 'not found' }, 404)) as typeof fetch;
  const warning = await detectForeignListener(3000, '1.3.3', fetcher);
  assert.ok(warning);
  assert.match(warning!, /HTTP 404/);
});

test('detectForeignListener stays quiet when nothing answers on loopback', async () => {
  const fetcher = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.equal(await detectForeignListener(3100, '1.3.3', fetcher), null);
});
