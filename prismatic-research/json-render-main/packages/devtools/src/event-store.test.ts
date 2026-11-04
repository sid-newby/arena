import { describe, expect, it, vi } from "vitest";
import { createEventStore } from "./event-store";
import type { DevtoolsEvent } from "./types";

function patchEvent(at = Date.now()): DevtoolsEvent {
  return {
    kind: "stream-patch",
    at,
    patch: {
      op: "add",
      path: "/elements/x",
      value: { type: "Card", props: {} },
    },
    source: "json",
  };
}

describe("createEventStore", () => {
  it("stores pushed events in insertion order", () => {
    const store = createEventStore();
    const a = patchEvent(1);
    const b = patchEvent(2);
    store.push(a);
    store.push(b);

    expect(store.snapshot()).toEqual([a, b]);
    expect(store.size()).toBe(2);
  });

  it("drops the oldest event when bufferSize is exceeded", () => {
    const store = createEventStore({ bufferSize: 3 });
    const events = [1, 2, 3, 4, 5].map((n) => patchEvent(n));
    for (const e of events) store.push(e);

    expect(store.snapshot()).toEqual([events[2], events[3], events[4]]);
    expect(store.size()).toBe(3);
  });

  it("clamps bufferSize to a minimum of 1", () => {
    const store = createEventStore({ bufferSize: 0 });
    store.push(patchEvent(1));
    store.push(patchEvent(2));
    expect(store.size()).toBe(1);
  });

  it("notifies subscribers on every push and on clear", () => {
    const store = createEventStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    store.push(patchEvent(1));
    store.push(patchEvent(2));
    expect(listener).toHaveBeenCalledTimes(2);

    store.clear();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.size()).toBe(0);

    unsub();
    store.push(patchEvent(3));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("clear is a no-op when already empty (no extra notify)", () => {
    const store = createEventStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a fresh array from snapshot each call", () => {
    const store = createEventStore();
    store.push(patchEvent(1));

    const a = store.snapshot();
    const b = store.snapshot();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("isolates listener errors from other listeners", () => {
    const store = createEventStore();
    const listenerA = vi.fn(() => {
      throw new Error("boom");
    });
    const listenerB = vi.fn();

    store.subscribe(listenerA);
    store.subscribe(listenerB);

    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    store.push(patchEvent(1));

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
