import test from 'node:test';
import assert from 'node:assert/strict';
import { isProviderUnavailable, withLocalFallback } from './fallback';

test('isProviderUnavailable only matches 503 and UNAVAILABLE', () => {
  assert.equal(isProviderUnavailable(new Error('LLM endpoint error (503): busy')), true);
  assert.equal(isProviderUnavailable(new Error('model UNAVAILABLE in region')), true);
  assert.equal(isProviderUnavailable(new Error('Invalid API key')), false);
  assert.equal(isProviderUnavailable('503 as a string'), false);
  assert.equal(isProviderUnavailable(null), false);
});

test('withLocalFallback returns the primary result when it succeeds', async () => {
  let fallbackCalls = 0;
  const result = await withLocalFallback(
    async () => 'provider answer',
    () => {
      fallbackCalls += 1;
      return 'local answer';
    }
  );
  assert.equal(result, 'provider answer');
  assert.equal(fallbackCalls, 0);
});

test('withLocalFallback degrades to the local engine on a 503', async () => {
  const result = await withLocalFallback(
    async () => {
      throw new Error('LLM endpoint error (503): upstream overloaded');
    },
    () => 'local answer'
  );
  assert.equal(result, 'local answer');
});

test('withLocalFallback degrades on UNAVAILABLE and supports async fallbacks', async () => {
  const result = await withLocalFallback(
    async () => {
      throw new Error('status UNAVAILABLE');
    },
    async () => 'local answer'
  );
  assert.equal(result, 'local answer');
});

test('withLocalFallback rethrows real request errors instead of hiding them', async () => {
  await assert.rejects(
    withLocalFallback(
      async () => {
        throw new Error('Invalid API key: PERMISSION_DENIED');
      },
      () => 'local answer'
    ),
    /PERMISSION_DENIED/
  );
});
