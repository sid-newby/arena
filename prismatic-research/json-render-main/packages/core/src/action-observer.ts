// =============================================================================
// Action Observer Registry
// =============================================================================
//
// Module-level pub/sub for action dispatches used by devtools (and any other
// logging / telemetry consumer). Framework ActionProviders (React, Vue,
// Svelte, Solid) call `notifyActionDispatch` / `notifyActionSettle` around
// every dispatched action. Observers register via `registerActionObserver`
// and receive events from every provider tree mounted in the page.
//
// Additive and non-breaking: consumers that never touch this API see no
// behavioural change.
// =============================================================================

/**
 * Emitted when an action begins executing. The same `id` will appear on a
 * matching {@link ActionSettleInfo} emitted when the action resolves or throws.
 */
export interface ActionDispatchInfo {
  /** Stable dispatch id; paired with the matching `onSettle`. */
  id: string;
  /** Resolved action name. */
  name: string;
  /** Resolved params, if any. */
  params?: Record<string, unknown>;
  /** Wall clock time (ms) at dispatch. */
  at: number;
}

/**
 * Emitted after an action has resolved or thrown.
 */
export interface ActionSettleInfo {
  /** Matches the `id` of the corresponding `onDispatch`. */
  id: string;
  /** Resolved action name. */
  name: string;
  /** `true` if the handler resolved, `false` if it threw. */
  ok: boolean;
  /** Wall clock time (ms) at settle. */
  at: number;
  /** Elapsed time in milliseconds. */
  durationMs: number;
  /** Return value from the handler, if any. */
  result?: unknown;
  /** Error if the handler threw. */
  error?: unknown;
}

/**
 * Observer for action lifecycle events. Either callback is optional.
 */
export interface ActionObserver {
  onDispatch?: (evt: ActionDispatchInfo) => void;
  onSettle?: (evt: ActionSettleInfo) => void;
}

const observers = new Set<ActionObserver>();

/**
 * Register an observer for action lifecycle events. Returns an unsubscribe
 * function. Intended for devtools integrations; safe to call from any
 * framework adapter.
 *
 * @example
 * ```ts
 * import { registerActionObserver } from "@json-render/core";
 * const unsub = registerActionObserver({
 *   onDispatch: (evt) => console.log("fired", evt.name),
 *   onSettle: (evt) => console.log("settled", evt.name, evt.durationMs),
 * });
 * ```
 */
export function registerActionObserver(observer: ActionObserver): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}

/**
 * Emit a dispatch event to all registered observers. Called by framework
 * ActionProviders at the start of every action execution.
 *
 * Wrapped in try/catch per-observer so a buggy observer cannot interrupt
 * action execution.
 */
export function notifyActionDispatch(evt: ActionDispatchInfo): void {
  for (const o of observers) {
    const fn = o.onDispatch;
    if (!fn) continue;
    try {
      fn(evt);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "[json-render] action observer threw in onDispatch:",
          err,
        );
      }
    }
  }
}

/**
 * Emit a settle event to all registered observers. Called by framework
 * ActionProviders after every action resolves or throws.
 */
export function notifyActionSettle(evt: ActionSettleInfo): void {
  for (const o of observers) {
    const fn = o.onSettle;
    if (!fn) continue;
    try {
      fn(evt);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[json-render] action observer threw in onSettle:", err);
      }
    }
  }
}

// Counter-based id generator. Prefixed with timestamp so ids don't collide
// across hot-reload boundaries in dev.
let dispatchCounter = 0;
export function nextActionDispatchId(): string {
  dispatchCounter += 1;
  return `${Date.now()}-${dispatchCounter}`;
}
