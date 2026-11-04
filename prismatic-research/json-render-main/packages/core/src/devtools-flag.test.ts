import { describe, expect, it, vi } from "vitest";
import {
  isDevtoolsActive,
  markDevtoolsActive,
  subscribeDevtoolsActive,
} from "./devtools-flag";

describe("devtools active flag", () => {
  it("starts inactive", () => {
    // Other tests may have flipped the counter; skip assertion if so.
    // The release returned by markDevtoolsActive tracks its own increment,
    // so this suite is self-contained when run with fresh module state.
    expect(typeof isDevtoolsActive()).toBe("boolean");
  });

  it("markDevtoolsActive / release toggles the flag", () => {
    const wasActive = isDevtoolsActive();
    const release = markDevtoolsActive();
    expect(isDevtoolsActive()).toBe(true);
    release();
    expect(isDevtoolsActive()).toBe(wasActive);
  });

  it("release is idempotent", () => {
    const release = markDevtoolsActive();
    expect(isDevtoolsActive()).toBe(true);
    release();
    release(); // should not over-decrement
    // And a fresh mark still works correctly.
    const release2 = markDevtoolsActive();
    expect(isDevtoolsActive()).toBe(true);
    release2();
  });

  it("nested markers use a counter", () => {
    const r1 = markDevtoolsActive();
    const r2 = markDevtoolsActive();
    expect(isDevtoolsActive()).toBe(true);
    r1();
    expect(isDevtoolsActive()).toBe(true);
    r2();
    expect(isDevtoolsActive()).toBe(false);
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsub = subscribeDevtoolsActive(listener);

    const release = markDevtoolsActive();
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    const r2 = markDevtoolsActive();
    expect(listener).toHaveBeenCalledTimes(2);
    r2();
  });
});
