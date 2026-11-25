/**
 * Decides where Tab should land inside a focus trap.
 *
 * Returns the element to focus when the browser's default tab order would leave
 * the dialog, or `null` when the default behaviour is already correct.
 */
export function resolveTabTarget<T>(items: T[], active: T | null, shiftKey: boolean): T | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = active !== null && items.includes(active);

  if (shiftKey) {
    return active === first || !inside ? last : null;
  }
  return active === last ? first : null;
}
