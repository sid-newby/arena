// =============================================================================
// Devtools Active Flag
// =============================================================================
//
// A tiny module-level counter that adapters increment while devtools is
// mounted. Framework renderers read it to decide whether to add the
// `data-jr-key` attribute that lets the picker map DOM nodes back to
// spec element keys.
//
// Purely opt-in; when no devtools is mounted the counter stays at 0 and
// renderers behave exactly as before.
// =============================================================================

let activeCount = 0;
const listeners = new Set<() => void>();

/**
 * Mark devtools as active. Returns a release function. Safe to call
 * multiple times (nested counter).
 *
 * @example
 * ```ts
 * // In a devtools adapter:
 * useEffect(() => markDevtoolsActive(), []);
 * ```
 */
export function markDevtoolsActive(): () => void {
  activeCount += 1;
  notifyDevtoolsActiveChange();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeCount = Math.max(0, activeCount - 1);
    notifyDevtoolsActiveChange();
  };
}

/**
 * True when at least one devtools adapter is mounted in the page.
 * Cheap to call; a plain integer comparison.
 */
export function isDevtoolsActive(): boolean {
  return activeCount > 0;
}

/**
 * Subscribe to changes in the devtools-active flag. Framework renderers
 * that need to re-render on state change (e.g. React's `useSyncExternalStore`)
 * subscribe here; most can just read `isDevtoolsActive()` on render.
 */
export function subscribeDevtoolsActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyDevtoolsActiveChange() {
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[json-render] devtools-active listener threw:", err);
      }
    }
  }
}
