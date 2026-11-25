import test from 'node:test';
import assert from 'node:assert/strict';
import { describeListenError } from './errors';

function errnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(`listen ${code}`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

test('describeListenError explains a taken port and suggests the next one', () => {
  const hint = describeListenError(errnoError('EADDRINUSE'), 3000);
  assert.ok(hint);
  assert.match(hint!, /Port 3000 is already in use/);
  assert.match(hint!, /PORT=3001 npm run dev/);
});

test('describeListenError explains the privileged-port case', () => {
  const hint = describeListenError(errnoError('EACCES'), 80);
  assert.ok(hint);
  assert.match(hint!, /requires elevated privileges/);
});

test('describeListenError stays out of the way for unrelated errors', () => {
  assert.equal(describeListenError(errnoError('ECONNREFUSED'), 3000), null);
});
