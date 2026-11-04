import { describe, expect, it, vi } from "vitest";
import {
  nextActionDispatchId,
  notifyActionDispatch,
  notifyActionSettle,
  registerActionObserver,
} from "./action-observer";

describe("action observer registry", () => {
  it("fires onDispatch for every registered observer", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = registerActionObserver({ onDispatch: a });
    const unsubB = registerActionObserver({ onDispatch: b });

    notifyActionDispatch({ id: "1", name: "foo", at: 10 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();

    unsubA();
    notifyActionDispatch({ id: "2", name: "bar", at: 20 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledTimes(2);

    unsubB();
  });

  it("fires onSettle with the same id as dispatch", () => {
    const settle = vi.fn();
    const unsub = registerActionObserver({ onSettle: settle });

    notifyActionSettle({
      id: "abc",
      name: "foo",
      ok: true,
      at: 10,
      durationMs: 3,
    });

    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "abc", ok: true, durationMs: 3 }),
    );
    unsub();
  });

  it("isolates observer throws", () => {
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const unsubA = registerActionObserver({ onDispatch: thrower });
    const unsubB = registerActionObserver({ onDispatch: good });

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    notifyActionDispatch({ id: "1", name: "foo", at: 0 });
    expect(thrower).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    spy.mockRestore();
    unsubA();
    unsubB();
  });

  it("returns unique dispatch ids", () => {
    const a = nextActionDispatchId();
    const b = nextActionDispatchId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\d+-\d+$/);
  });
});
