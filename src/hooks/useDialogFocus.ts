import { useEffect, type RefObject } from 'react';
import { resolveTabTarget } from '../utils/focus';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function collectFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0
  );
}

/**
 * Keeps keyboard focus inside a modal and restores it to the trigger on close.
 *
 * - focuses the first focusable child when the dialog mounts
 * - wraps Tab / Shift+Tab at both ends so focus can never reach the page behind
 * - returns focus to the element that was active before the dialog opened
 */
export function useDialogFocus(containerRef: RefObject<HTMLElement | null>, isOpen = true): void {
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const previous = document.activeElement;
    const previousElement = previous instanceof HTMLElement ? previous : null;

    const initial = collectFocusable(container)[0] ?? container;
    initial.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = collectFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = resolveTabTarget(focusable, active, event.shiftKey);
      if (!target) return;

      event.preventDefault();
      target.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousElement?.isConnected) previousElement.focus({ preventScroll: true });
    };
  }, [containerRef, isOpen]);
}
