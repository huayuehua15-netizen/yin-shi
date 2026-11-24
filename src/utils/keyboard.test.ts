import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditableTarget, resolveShortcut } from './keyboard';

function press(key: string, overrides: Record<string, unknown> = {}) {
  return { key, ...overrides };
}

test('maps playback shortcuts', () => {
  assert.equal(resolveShortcut(press(' '), { overlayOpen: false }), 'toggle-play');
  assert.equal(resolveShortcut(press('Spacebar'), { overlayOpen: false }), 'toggle-play');
  assert.equal(resolveShortcut(press('ArrowLeft'), { overlayOpen: false }), 'seek-backward');
  assert.equal(resolveShortcut(press('ArrowRight'), { overlayOpen: false }), 'seek-forward');
});

test('maps navigation and dialog shortcuts', () => {
  assert.equal(resolveShortcut(press('j'), { overlayOpen: false }), 'next-call');
  assert.equal(resolveShortcut(press('K'), { overlayOpen: false }), 'prev-call');
  assert.equal(resolveShortcut(press('u'), { overlayOpen: false }), 'open-upload');
  assert.equal(resolveShortcut(press('?'), { overlayOpen: false }), 'toggle-shortcuts');
});

test('ignores modifier combinations and unrelated keys', () => {
  assert.equal(resolveShortcut(press('j', { ctrlKey: true }), { overlayOpen: false }), null);
  assert.equal(resolveShortcut(press('k', { metaKey: true }), { overlayOpen: false }), null);
  assert.equal(resolveShortcut(press('u', { altKey: true }), { overlayOpen: false }), null);
  assert.equal(resolveShortcut(press('Enter'), { overlayOpen: false }), null);
  assert.equal(resolveShortcut(press('Escape'), { overlayOpen: false }), null);
});

test('suppresses shortcuts while typing in editable targets', () => {
  const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
  const textarea = { tagName: 'textarea', isContentEditable: false } as unknown as EventTarget;
  const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;

  assert.equal(isEditableTarget(input), true);
  assert.equal(isEditableTarget(textarea), true);
  assert.equal(isEditableTarget(editable), true);
  assert.equal(isEditableTarget(null), false);

  assert.equal(resolveShortcut(press(' ', { target: input }), { overlayOpen: false }), null);
  assert.equal(resolveShortcut(press('j', { target: textarea }), { overlayOpen: false }), null);
  assert.equal(resolveShortcut(press('?', { target: editable }), { overlayOpen: false }), null);
});

test('overlay mode only honors escape', () => {
  assert.equal(resolveShortcut(press('Escape'), { overlayOpen: true }), 'close-overlay');
  assert.equal(resolveShortcut(press(' '), { overlayOpen: true }), null);
  assert.equal(resolveShortcut(press('j'), { overlayOpen: true }), null);
});
