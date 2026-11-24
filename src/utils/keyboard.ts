export type ShortcutAction =
  | 'toggle-play'
  | 'seek-backward'
  | 'seek-forward'
  | 'next-call'
  | 'prev-call'
  | 'open-upload'
  | 'toggle-shortcuts'
  | 'close-overlay';

export interface ShortcutEventLike {
  key: string;
  target?: EventTarget | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface ShortcutOptions {
  overlayOpen: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableTarget(target?: EventTarget | null): boolean {
  if (!target) return false;
  const element = target as HTMLElement;
  if (typeof element.tagName !== 'string') return false;
  if (element.isContentEditable) return true;
  return EDITABLE_TAGS.has(element.tagName.toUpperCase());
}

/**
 * Maps a keyboard event to a workspace action. Shortcuts are suppressed while
 * typing in form fields and while a dialog is open (only Escape is honored).
 */
export function resolveShortcut(
  event: ShortcutEventLike,
  options: ShortcutOptions
): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (options.overlayOpen) {
    return event.key === 'Escape' ? 'close-overlay' : null;
  }

  if (event.key === 'Escape') return null;
  if (isEditableTarget(event.target)) return null;

  switch (event.key) {
    case ' ':
    case 'Spacebar':
      return 'toggle-play';
    case 'ArrowLeft':
      return 'seek-backward';
    case 'ArrowRight':
      return 'seek-forward';
    case 'j':
    case 'J':
      return 'next-call';
    case 'k':
    case 'K':
      return 'prev-call';
    case 'u':
    case 'U':
      return 'open-upload';
    case '?':
      return 'toggle-shortcuts';
    default:
      return null;
  }
}
