import type { DevtoolsEvent } from "./types";

/**
 * Options for {@link createEventStore}.
 */
export interface EventStoreOptions {
  /** Max events to retain. Older events are dropped. Default: 500. */
  bufferSize?: number;
}

/**
 * A capped, subscribable ring buffer of {@link DevtoolsEvent}s.
 *
 * Core to every devtools panel — all adapters push into the same store,
 * and panel UIs subscribe for render updates.
 */
export interface EventStore {
  /** Append an event. May drop the oldest event if the buffer is full. */
  push: (event: DevtoolsEvent) => void;
  /**
   * Current events in insertion order (oldest first). Returns a fresh
   * array so callers can treat it as immutable.
   */
  snapshot: () => DevtoolsEvent[];
  /**
   * Register a listener invoked after every push (or `clear`). Returns
   * an unsubscribe function. Listeners are invoked synchronously.
   */
  subscribe: (listener: () => void) => () => void;
  /** Remove all events. Notifies listeners. */
  clear: () => void;
  /** Current event count. */
  size: () => number;
}

/**
 * Create an in-memory ring-buffered event store.
 *
 * @example
 * ```ts
 * const store = createEventStore({ bufferSize: 200 });
 * const unsub = store.subscribe(() => render(store.snapshot()));
 * store.push({ kind: "state-set", at: Date.now(), path: "/x", prev: 1, next: 2 });
 * ```
 */
export function createEventStore(options: EventStoreOptions = {}): EventStore {
  const bufferSize = Math.max(1, options.bufferSize ?? 500);
  const events: DevtoolsEvent[] = [];
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[json-render devtools] listener threw:", err);
        }
      }
    }
  }

  return {
    push(event) {
      events.push(event);
      if (events.length > bufferSize) {
        events.splice(0, events.length - bufferSize);
      }
      notify();
    },
    snapshot() {
      return events.slice();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      if (events.length === 0) return;
      events.length = 0;
      notify();
    },
    size() {
      return events.length;
    },
  };
}
