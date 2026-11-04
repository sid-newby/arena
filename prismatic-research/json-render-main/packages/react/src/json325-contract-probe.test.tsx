import { act, render } from "@testing-library/react";
import type { Spec } from "@json-render/core";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { useStateStore } from "./contexts/state";
import { JSONUIProvider, Renderer, type ComponentRegistry } from "./renderer";

function renderValue(value: unknown) {
  const registry: ComponentRegistry = {
    Value: ({ element }) => <span>{String(element.props.value)}</span>,
  };
  const spec: Spec = {
    root: "value",
    elements: { value: { type: "Value", props: { value } } },
  };
  return {
    registry,
    spec,
    view: render(
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>,
    ),
  };
}

describe("JSON Render PR #325 contract probes", () => {
  it("preserves nested resolved prop identity across unrelated state writes", () => {
    let effects = 0;
    function Value({
      element,
    }: React.ComponentProps<ComponentRegistry[string]>) {
      const { set } = useStateStore();
      React.useEffect(() => {
        effects += 1;
        if (effects < 3) set("/unrelated", effects);
      }, [element.props.options, set]);
      return null;
    }
    const registry: ComponentRegistry = { Value };
    const spec: Spec = {
      root: "value",
      elements: {
        value: {
          type: "Value",
          props: { options: { layout: { gap: 8 } } },
        },
      },
    };

    render(
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>,
    );

    expect(effects).toBe(1);
  });

  it("shares unchanged resolved subtrees when a sibling changes", () => {
    const observed: Array<Record<string, unknown>> = [];
    const registry: ComponentRegistry = {
      Value: ({ element }) => {
        observed.push(element.props);
        return null;
      },
    };
    const first: Spec = {
      root: "value",
      state: { revision: 1 },
      elements: {
        value: {
          type: "Value",
          props: {
            options: { layout: { gap: 8 }, columns: [1, 2] },
            revision: { $state: "/revision" },
          },
        },
      },
    };
    let setRevision: ((value: number) => void) | undefined;
    function Controls() {
      const { set } = useStateStore();
      setRevision = (value) => set("/revision", value);
      return null;
    }

    render(
      <JSONUIProvider registry={registry} initialState={first.state}>
        <Controls />
        <Renderer spec={first} registry={registry} />
      </JSONUIProvider>,
    );
    act(() => setRevision?.(2));

    expect(observed).toHaveLength(2);
    expect(observed[1]).not.toBe(observed[0]);
    expect(observed[1]?.options).toBe(observed[0]?.options);
    expect((observed[1]?.options as { layout: unknown }).layout).toBe(
      (observed[0]?.options as { layout: unknown }).layout,
    );
    expect((observed[1]?.options as { columns: unknown }).columns).toBe(
      (observed[0]?.options as { columns: unknown }).columns,
    );
    expect(observed[1]?.revision).toBe(2);
  });

  it("does not mutate containers delivered by reference from state", () => {
    const observed: unknown[] = [];
    const registry: ComponentRegistry = {
      Value: ({ element }) => {
        observed.push(element.props.user);
        return null;
      },
    };
    const spec: Spec = {
      root: "value",
      state: { user: { profile: { name: "a" }, revision: 1 } },
      elements: {
        value: { type: "Value", props: { user: { $state: "/user" } } },
      },
    };
    let setUser: ((value: unknown) => void) | undefined;
    function Controls() {
      const { set } = useStateStore();
      setUser = (value) => set("/user", value);
      return null;
    }

    render(
      <JSONUIProvider registry={registry} initialState={spec.state}>
        <Controls />
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>,
    );
    const replacementProfile = { name: "a" };
    const replacement = { profile: replacementProfile, revision: 2 };
    act(() => setUser?.(replacement));

    expect(replacement.profile).toBe(replacementProfile);
    expect((observed.at(-1) as { revision: number }).revision).toBe(2);

    const frozen = Object.freeze({
      profile: Object.freeze({ name: "a" }),
      revision: 3,
    });
    expect(() => act(() => setUser?.(frozen))).not.toThrow();
    expect((observed.at(-1) as { revision: number }).revision).toBe(3);
  });

  it("delivers changed resolved object and array subtrees as fresh values", () => {
    const observed: unknown[] = [];
    const registry: ComponentRegistry = {
      Value: ({ element }) => {
        observed.push(element.props.options);
        return null;
      },
    };
    const spec: Spec = {
      root: "value",
      state: { gap: 8 },
      elements: {
        value: {
          type: "Value",
          props: {
            options: {
              layout: { gap: { $state: "/gap" } },
              columns: [{ $state: "/gap" }],
            },
          },
        },
      },
    };
    let setGap: ((value: number) => void) | undefined;
    function Controls() {
      const { set } = useStateStore();
      setGap = (value) => set("/gap", value);
      return null;
    }

    render(
      <JSONUIProvider registry={registry} initialState={spec.state}>
        <Controls />
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>,
    );
    act(() => setGap?.(12));

    const first = observed[0] as {
      layout: Record<string, unknown>;
      columns: unknown[];
    };
    const second = observed[1] as typeof first;
    expect(second).not.toBe(first);
    expect(second.layout).not.toBe(first.layout);
    expect(second.columns).not.toBe(first.columns);
    expect(second.layout.gap).toBe(12);
    expect(second.columns[0]).toBe(12);
  });

  it.each([
    [
      "nested present undefined to absent",
      { value: { nested: undefined } },
      { value: {} },
    ],
    [
      "nested absent to present undefined",
      { value: {} },
      { value: { nested: undefined } },
    ],
    ["function identity", { value: () => "first" }, { value: () => "second" }],
    [
      "symbol identity",
      { value: Symbol("first") },
      { value: Symbol("second") },
    ],
    ["BigInt value", { value: 1n }, { value: 2n }],
  ])("distinguishes changed %s", (_label, firstProps, secondProps) => {
    const display = (value: unknown) => {
      if (typeof value === "function") return value();
      if (value && typeof value === "object") {
        return Object.keys(value).join(",");
      }
      return String(value);
    };
    const registry: ComponentRegistry = {
      Value: ({ element }) => (
        <span>{`${Object.keys(element.props).join(",")}:${display(element.props.value)}`}</span>
      ),
    };
    const initial: Spec = {
      root: "value",
      elements: { value: { type: "Value", props: firstProps } },
    };
    const view = render(
      <JSONUIProvider registry={registry}>
        <Renderer spec={initial} registry={registry} />
      </JSONUIProvider>,
    );
    const next: Spec = {
      root: "value",
      elements: { value: { type: "Value", props: secondProps } },
    };

    view.rerender(
      <JSONUIProvider registry={registry}>
        <Renderer spec={next} registry={registry} />
      </JSONUIProvider>,
    );

    expect(view.container.textContent).toBe(
      `${Object.keys(secondProps).join(",")}:${display(secondProps.value)}`,
    );
  });

  it("accepts BigInt prop values without throwing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderValue(1n)).not.toThrow();
    error.mockRestore();
  });

  it("does not invalidate an unchanged nested NaN value", () => {
    const component = vi.fn(() => null);
    const registry: ComponentRegistry = { Value: component };
    const first: Spec = {
      root: "value",
      elements: {
        value: { type: "Value", props: { value: { nested: Number.NaN } } },
      },
    };
    const view = render(
      <JSONUIProvider registry={registry}>
        <Renderer spec={first} registry={registry} />
      </JSONUIProvider>,
    );
    const second: Spec = {
      root: "value",
      elements: {
        value: { type: "Value", props: { value: { nested: Number.NaN } } },
      },
    };

    view.rerender(
      <JSONUIProvider registry={registry}>
        <Renderer spec={second} registry={registry} />
      </JSONUIProvider>,
    );

    expect(component).toHaveBeenCalledTimes(1);
  });

  it("invalidates a nested negative zero to zero transition", () => {
    const component = vi.fn(
      ({ element }: React.ComponentProps<ComponentRegistry[string]>) => (
        <span>
          {Object.is((element.props.value as { nested: number }).nested, -0)
            ? "negative-zero"
            : "zero"}
        </span>
      ),
    );
    const registry: ComponentRegistry = { Value: component };
    const first: Spec = {
      root: "value",
      elements: {
        value: { type: "Value", props: { value: { nested: -0 } } },
      },
    };
    const view = render(
      <JSONUIProvider registry={registry}>
        <Renderer spec={first} registry={registry} />
      </JSONUIProvider>,
    );
    const second: Spec = {
      root: "value",
      elements: {
        value: { type: "Value", props: { value: { nested: 0 } } },
      },
    };

    view.rerender(
      <JSONUIProvider registry={registry}>
        <Renderer spec={second} registry={registry} />
      </JSONUIProvider>,
    );

    expect(component).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toBe("zero");
  });

  it.each([
    ["function", () => "stable"],
    ["symbol", Symbol("stable")],
    ["BigInt", 1n],
  ])("does not invalidate an unchanged %s value", (_label, value) => {
    const component = vi.fn(() => null);
    const registry: ComponentRegistry = { Value: component };
    const first: Spec = {
      root: "value",
      elements: { value: { type: "Value", props: { value } } },
    };
    const view = render(
      <JSONUIProvider registry={registry}>
        <Renderer spec={first} registry={registry} />
      </JSONUIProvider>,
    );
    const second: Spec = {
      root: "value",
      elements: { value: { type: "Value", props: { value } } },
    };

    view.rerender(
      <JSONUIProvider registry={registry}>
        <Renderer spec={second} registry={registry} />
      </JSONUIProvider>,
    );

    expect(component).toHaveBeenCalledTimes(1);
  });
});
