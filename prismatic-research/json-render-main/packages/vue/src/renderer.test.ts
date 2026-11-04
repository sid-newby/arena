import { afterEach, describe, it, expect, vi } from "vitest";
import { defineComponent, h, type Component } from "vue";
import { mount } from "@vue/test-utils";
import { defineCatalog, type Spec } from "@json-render/core";
import { z } from "zod";
import { StateProvider } from "./composables/state";
import { VisibilityProvider } from "./composables/visibility";
import { ActionProvider } from "./composables/actions";
import { ValidationProvider } from "./composables/validation";
import { Renderer, defineRegistry, type ComponentRegistry } from "./renderer";
import { schema } from "./schema";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Minimal test catalog and registry
// ---------------------------------------------------------------------------

// defineRegistry ignores the catalog object at runtime — use any cast
const catalog = {} as any;

const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => {
      const p = props as Record<string, unknown>;
      return h(
        "div",
        { "data-type": "card", "data-title": String(p["title"] ?? "") },
        [String(p["title"] ?? ""), children],
      );
    },
    Button: ({ props, emit }) => {
      const p = props as Record<string, unknown>;
      return h(
        "button",
        { "data-type": "button", onClick: () => emit("press") },
        String(p["label"] ?? ""),
      );
    },
  },
});

// ---------------------------------------------------------------------------
// Mount helper: wraps in the full provider chain required by ElementRenderer
// ---------------------------------------------------------------------------

function mountRenderer(
  spec: Spec | null,
  reg: ComponentRegistry = registry,
  extraProps: Record<string, unknown> = {},
  handlers: Record<
    string,
    (params: Record<string, unknown>) => Promise<void>
  > = {},
  initialState: Record<string, unknown> = {},
) {
  return mount(StateProvider as Component, {
    props: { initialState } as any,
    slots: {
      default: () =>
        h(VisibilityProvider as Component, null, {
          default: () =>
            h(ValidationProvider as Component, null, {
              default: () =>
                h(ActionProvider as Component, { handlers } as any, {
                  default: () =>
                    h(Renderer, { spec, registry: reg, ...extraProps }),
                }),
            }),
        }),
    },
  });
}

function layoutSpec(slots: Record<string, string[]>): Spec {
  return {
    root: "layout",
    elements: {
      layout: {
        type: "Layout",
        props: {},
        children: ["main"],
        slots,
      },
      main: { type: "Text", props: { text: "Main" } },
      header: { type: "Text", props: { text: "Header" } },
      other: { type: "Text", props: { text: "Other" } },
    },
  };
}

// ---------------------------------------------------------------------------
// defineRegistry tests
// ---------------------------------------------------------------------------

describe("defineRegistry", () => {
  it("wraps a render function and returns a Vue component", () => {
    const result = defineRegistry(catalog, {
      components: {
        MyComp: () => h("span", null, "hello"),
      },
    });
    expect(result.registry).toBeDefined();
    expect(result.registry["MyComp"]).toBeDefined();
  });

  it("component receives resolved props from the spec element", () => {
    const spec: Spec = {
      root: "btn1",
      elements: {
        btn1: { type: "Button", props: { label: "Press me" } },
      },
    };
    const wrapper = mountRenderer(spec);
    expect(wrapper.find("[data-type='button']").text()).toBe("Press me");
  });

  it("children is passed for container components", () => {
    const spec: Spec = {
      root: "card1",
      elements: {
        card1: {
          type: "Card",
          props: { title: "My Card" },
          children: ["btn1"],
        },
        btn1: { type: "Button", props: { label: "Click" } },
      },
    };
    const wrapper = mountRenderer(spec);
    expect(wrapper.find("[data-type='card']").exists()).toBe(true);
    expect(wrapper.find("[data-type='button']").exists()).toBe(true);
  });

  it("renders named slots as Vue slot functions through defineRegistry", () => {
    const namedSlotsCatalog = defineCatalog(schema, {
      components: {
        Layout: {
          props: z.object({}),
          slots: ["default", "header", "footer"],
        },
        Text: {
          props: z.object({ text: z.string() }),
          slots: [],
        },
      },
      actions: {},
    });
    const { registry: namedSlotsRegistry } = defineRegistry(namedSlotsCatalog, {
      components: {
        Layout: ({ slots }) =>
          h("section", null, [
            h("header", { "data-testid": "header-slot" }, slots.header?.()),
            h("main", { "data-testid": "default-slot" }, slots.default?.()),
            h("footer", { "data-testid": "footer-slot" }, slots.footer?.()),
          ]),
        Text: ({ props }) => h("span", null, props.text),
      },
    });
    const spec: Spec = {
      root: "layout",
      elements: {
        layout: {
          type: "Layout",
          props: {},
          children: ["main"],
          slots: {
            header: ["header"],
            footer: ["footer"],
          },
        },
        header: { type: "Text", props: { text: "Header" } },
        main: { type: "Text", props: { text: "Main" } },
        footer: { type: "Text", props: { text: "Footer" } },
      },
    };

    const wrapper = mountRenderer(spec, namedSlotsRegistry);

    expect(wrapper.find('[data-testid="header-slot"]').text()).toBe("Header");
    expect(wrapper.find('[data-testid="default-slot"]').text()).toBe("Main");
    expect(wrapper.find('[data-testid="footer-slot"]').text()).toBe("Footer");
  });

  it("advertises named slots in the Vue catalog prompt without default", () => {
    const namedSlotsCatalog = defineCatalog(schema, {
      components: {
        Layout: { props: z.object({}), slots: ["default", "header"] },
      },
      actions: {},
    });

    const prompt = namedSlotsCatalog.prompt();

    expect(prompt).toContain("slots: header");
    expect(prompt).not.toContain("slots: default");
  });

  it("warns and ignores slots.default while preserving children", () => {
    const namedSlotsCatalog = defineCatalog(schema, {
      components: {
        Layout: { props: z.object({}), slots: ["default"] },
        Text: { props: z.object({ text: z.string() }), slots: [] },
      },
      actions: {},
    });
    const { registry: namedSlotsRegistry } = defineRegistry(namedSlotsCatalog, {
      components: {
        Layout: ({ children }) => h("main", null, children),
        Text: ({ props }) => h("span", null, props.text),
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const wrapper = mountRenderer(
      layoutSpec({ default: ["other"] }),
      namedSlotsRegistry,
    );

    expect(wrapper.text()).toBe("Main");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("slots.default"));
  });

  it("warns but renders an undeclared named slot", () => {
    const namedSlotsCatalog = defineCatalog(schema, {
      components: {
        Layout: { props: z.object({}), slots: ["default"] },
        Text: { props: z.object({ text: z.string() }), slots: [] },
      },
      actions: {},
    });
    const { registry: namedSlotsRegistry } = defineRegistry(namedSlotsCatalog, {
      components: {
        Layout: ({ slots }) => h("aside", null, slots.sidebar?.()),
        Text: ({ props }) => h("span", null, props.text),
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const wrapper = mountRenderer(
      layoutSpec({ sidebar: ["other"] }),
      namedSlotsRegistry,
    );

    expect(wrapper.text()).toBe("Other");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown slot "sidebar"'),
    );
  });

  it("emit('press') fires the corresponding on.press action", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const spec: Spec = {
      root: "btn1",
      elements: {
        btn1: {
          type: "Button",
          props: { label: "Click" },
          on: { press: { action: "myAction" } },
        },
      },
    };
    const wrapper = mountRenderer(spec, registry, {}, { myAction: handler });
    await wrapper.find("[data-type='button']").trigger("click");
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Renderer tests
// ---------------------------------------------------------------------------

describe("Renderer", () => {
  it("delivers raw registry named slots lazily", () => {
    let footerCalls = 0;
    const Layout = defineComponent({
      setup(_, { slots }) {
        return () =>
          h("section", null, [
            h("header", null, slots.header?.()),
            h("main", null, slots.default?.()),
            slots.footer ? h("i", null, "has-footer") : null,
          ]);
      },
    });
    const Text = defineComponent({
      props: { element: { type: Object, required: true } },
      setup(props) {
        return () => h("span", null, (props.element as any).props.text);
      },
    });
    const Footer = defineComponent({
      setup() {
        footerCalls += 1;
        return () => h("span", null, "Footer");
      },
    });
    const spec = layoutSpec({ header: ["header"], footer: ["footer"] });
    spec.elements.footer = { type: "Footer", props: {} };

    const wrapper = mountRenderer(spec, { Layout, Text, Footer });

    expect(wrapper.text()).toContain("Header");
    expect(wrapper.text()).toContain("Main");
    expect(wrapper.text()).toContain("has-footer");
    expect(wrapper.text()).not.toContain("Footer");
    expect(footerCalls).toBe(0);
  });

  it("suppresses missing named slot warnings while loading", () => {
    const Layout = defineComponent({
      setup(_, { slots }) {
        return () => h("header", null, slots.header?.());
      },
    });
    const spec = layoutSpec({ header: ["missing"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadingWrapper = mountRenderer(spec, { Layout }, { loading: true });
    expect(warn).not.toHaveBeenCalled();
    loadingWrapper.unmount();

    mountRenderer(spec, { Layout }, { loading: false });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('in slot "header"'),
    );
  });

  it("renders owner named slots once outside the owner repeat scope", () => {
    const Layout = defineComponent({
      setup(_, { slots }) {
        return () => h("section", null, [slots.header?.(), slots.default?.()]);
      },
    });
    const Text = defineComponent({
      props: { element: { type: Object, required: true } },
      setup(props) {
        return () => h("span", null, (props.element as any).props.text);
      },
    });
    const spec: Spec = {
      root: "layout",
      elements: {
        layout: {
          type: "Layout",
          props: {},
          repeat: { statePath: "/items" },
          children: ["row"],
          slots: { header: ["header"] },
        },
        row: { type: "Text", props: { text: { $item: "name" } } },
        header: { type: "Text", props: { text: "Header" } },
      },
    };

    const wrapper = mountRenderer(
      spec,
      { Layout, Text },
      {},
      {},
      { items: [{ name: "A" }, { name: "B" }] },
    );

    expect(wrapper.text()).toBe("HeaderAB");
  });

  it("renders a single-element spec", () => {
    const spec: Spec = {
      root: "btn1",
      elements: {
        btn1: { type: "Button", props: { label: "Go" } },
      },
    };
    const wrapper = mountRenderer(spec);
    expect(wrapper.find("[data-type='button']").exists()).toBe(true);
    expect(wrapper.find("[data-type='button']").text()).toBe("Go");
  });

  it("renders a nested spec (parent contains a child by key reference)", () => {
    const spec: Spec = {
      root: "card1",
      elements: {
        card1: {
          type: "Card",
          props: { title: "Root" },
          children: ["btn1"],
        },
        btn1: { type: "Button", props: { label: "Action" } },
      },
    };
    const wrapper = mountRenderer(spec);
    const card = wrapper.find("[data-type='card']");
    expect(card.exists()).toBe(true);
    expect(card.find("[data-type='button']").exists()).toBe(true);
  });

  it("uses fallback component for unknown element types", () => {
    const fallback = defineComponent({
      setup() {
        return () => h("span", { "data-type": "fallback" }, "fallback");
      },
    });
    const spec: Spec = {
      root: "el1",
      elements: {
        el1: { type: "Unknown", props: {} },
      },
    };
    const wrapper = mountRenderer(spec, registry, { fallback });
    expect(wrapper.find("[data-type='fallback']").exists()).toBe(true);
  });

  it("passes loading prop through to registered components", () => {
    let receivedLoading: boolean | undefined;
    const { registry: testRegistry } = defineRegistry(catalog, {
      components: {
        Widget: ({ loading }) => {
          receivedLoading = loading;
          return h("div", null, "widget");
        },
      },
    });
    const spec: Spec = {
      root: "w1",
      elements: { w1: { type: "Widget", props: {} } },
    };
    mountRenderer(spec, testRegistry, { loading: true });
    expect(receivedLoading).toBe(true);
  });
});
