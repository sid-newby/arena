import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import {
  registerActionObserver,
  markDevtoolsActive,
  type ActionDispatchInfo,
  type ActionSettleInfo,
  type Spec,
} from "@json-render/core";
import {
  JSONUIProvider,
  Renderer,
  type ComponentRenderProps,
} from "./renderer";

/**
 * These tests cover the two core hooks the devtools package relies on:
 * - Action observer pipeline (React ActionProvider → notifyActionDispatch /
 *   notifyActionSettle → registerActionObserver).
 * - Element-tag wrapper gated by markDevtoolsActive.
 *
 * Asserting on the wiring here keeps the framework-agnostic adapter code in
 * the devtools packages thin.
 */

function Button({ element, emit }: ComponentRenderProps<{ label: string }>) {
  return (
    <button data-testid={`btn-${element.type}`} onClick={() => emit("press")}>
      {element.props.label}
    </button>
  );
}

const SIMPLE_SPEC: Spec = {
  root: "btn-1",
  elements: {
    "btn-1": {
      type: "Button",
      props: { label: "Click me" },
      on: {
        press: {
          action: "setState",
          params: { statePath: "/count", value: 1 },
        },
      },
    },
  },
};

describe("action observer integration", () => {
  let dispatches: ActionDispatchInfo[];
  let settles: ActionSettleInfo[];
  let unsub: () => void;

  beforeEach(() => {
    dispatches = [];
    settles = [];
    unsub = registerActionObserver({
      onDispatch: (evt) => dispatches.push(evt),
      onSettle: (evt) => settles.push(evt),
    });
    return () => unsub();
  });

  it("fires onDispatch + onSettle when a button emits press", async () => {
    const { getByTestId } = render(
      <JSONUIProvider registry={{ Button }} initialState={{ count: 0 }}>
        <Renderer spec={SIMPLE_SPEC} registry={{ Button }} />
      </JSONUIProvider>,
    );

    await act(async () => {
      fireEvent.click(getByTestId("btn-Button"));
    });

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]?.name).toBe("setState");
    expect(dispatches[0]?.params).toEqual({
      statePath: "/count",
      value: 1,
    });

    expect(settles).toHaveLength(1);
    expect(settles[0]?.ok).toBe(true);
    expect(settles[0]?.id).toBe(dispatches[0]?.id);
    expect(typeof settles[0]?.durationMs).toBe("number");
  });
});

describe("element-tag wrapper (picker support)", () => {
  it("adds data-jr-key attribute when devtools is active", () => {
    const release = markDevtoolsActive();
    try {
      const { container } = render(
        <JSONUIProvider registry={{ Button }}>
          <Renderer spec={SIMPLE_SPEC} registry={{ Button }} />
        </JSONUIProvider>,
      );
      const tagged = container.querySelector("[data-jr-key]");
      expect(tagged).not.toBeNull();
      expect(tagged?.getAttribute("data-jr-key")).toBe("btn-1");
    } finally {
      // Wrap in act() so the resulting devtools-flag subscribers update
      // the React tree inside the testing batch boundary.
      act(() => release());
    }
  });

  it("does NOT add data-jr-key when devtools is inactive", () => {
    const { container } = render(
      <JSONUIProvider registry={{ Button }}>
        <Renderer spec={SIMPLE_SPEC} registry={{ Button }} />
      </JSONUIProvider>,
    );
    expect(container.querySelector("[data-jr-key]")).toBeNull();
  });
});
