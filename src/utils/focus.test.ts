import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTabTarget } from './focus';

const items = ['close', 'tab-upload', 'tab-record', 'submit'];

describe('resolveTabTarget', () => {
  it('does nothing when the dialog has no focusable elements', () => {
    assert.equal(resolveTabTarget([], null, false), null);
    assert.equal(resolveTabTarget([], 'anything', true), null);
  });

  it('lets Tab move forward in the middle of the dialog', () => {
    assert.equal(resolveTabTarget(items, 'tab-upload', false), null);
  });

  it('wraps forward from the last element to the first', () => {
    assert.equal(resolveTabTarget(items, 'submit', false), 'close');
  });

  it('wraps backward from the first element to the last', () => {
    assert.equal(resolveTabTarget(items, 'close', true), 'submit');
  });

  it('pulls focus back inside when it escaped the dialog', () => {
    assert.equal(resolveTabTarget(items, 'body', true), 'submit');
    assert.equal(resolveTabTarget(items, null, true), 'submit');
  });

  it('lets Shift+Tab move backward in the middle of the dialog', () => {
    assert.equal(resolveTabTarget(items, 'tab-record', true), null);
  });
});
