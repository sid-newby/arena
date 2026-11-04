import { h, replaceChildren } from "../dom";
import type { PanelContext, TabDef, TabInstance } from "../types";

const TAB_ID = "catalog";

interface CatalogField {
  name: string;
  type: string;
}

interface CatalogComponentInfo {
  name: string;
  description: string;
  props: CatalogField[];
  slots: string[];
  events: string[];
}

interface CatalogActionInfo {
  name: string;
  description: string;
  params: CatalogField[];
}

/**
 * Catalog Browser tab — lists the components and actions declared in the
 * attached catalog with prop/param chips, so developers can see what the
 * AI can use.
 */
export function catalogTab(): TabDef {
  return {
    id: TAB_ID,
    label: "Catalog",
    badge(ctx) {
      const cat = ctx.getCatalog();
      if (!cat) return undefined;
      const n = cat.componentNames.length + cat.actionNames.length;
      return n || undefined;
    },
    mount(root, ctx) {
      return mountCatalogTab(root, ctx);
    },
  };
}

function mountCatalogTab(root: HTMLElement, ctx: PanelContext): TabInstance {
  const container = h("div", {
    style: { height: "100%", display: "flex", flexDirection: "column" },
  });
  const toolbar = h("div", { className: "jr-toolbar" });
  const body = h("div", {
    style: { overflow: "auto", flex: "1", minHeight: "0" },
  });
  container.appendChild(toolbar);
  container.appendChild(body);
  root.appendChild(container);

  let view: "components" | "actions" = "components";
  let filter = "";

  // Toolbar controls are mounted once so their DOM identity (and thus the
  // search input's focus + caret position) survives every re-render —
  // without this, typing into the filter would lose focus after each key.
  const componentsBtn = h(
    "button",
    {
      className: "jr-icon-btn",
      "data-active": "true",
      onClick: () => {
        if (view === "components") return;
        view = "components";
        updateToolbarChrome();
        renderBody();
      },
    },
    "components",
  );
  const actionsBtn = h(
    "button",
    {
      className: "jr-icon-btn",
      "data-active": "false",
      onClick: () => {
        if (view === "actions") return;
        view = "actions";
        updateToolbarChrome();
        renderBody();
      },
    },
    "actions",
  );
  const searchInput = h("input", {
    className: "jr-search",
    type: "text",
    placeholder: "Filter by name\u2026",
    onInput: (ev: Event) => {
      filter = ((ev.target as HTMLInputElement).value || "").toLowerCase();
      renderBody();
    },
  }) as HTMLInputElement;
  toolbar.append(componentsBtn, actionsBtn, searchInput);

  function updateToolbarChrome() {
    const catalog = ctx.getCatalog();
    const display = catalog ? buildCatalogDisplayData(catalog.data) : null;
    const cCount = display?.components.length ?? 0;
    const aCount = display?.actions.length ?? 0;
    componentsBtn.textContent = `components (${cCount})`;
    actionsBtn.textContent = `actions (${aCount})`;
    componentsBtn.dataset.active = String(view === "components");
    actionsBtn.dataset.active = String(view === "actions");
  }

  function renderBody() {
    const catalog = ctx.getCatalog();
    if (!catalog) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "jr-empty" },
          "No catalog attached. Pass `catalog` to `<JsonRenderDevtools>` to browse it here.",
        ),
      );
      return;
    }

    const display = buildCatalogDisplayData(catalog.data);
    if (view === "components") {
      const items = display.components.filter(
        (c) => !filter || c.name.toLowerCase().includes(filter),
      );
      if (items.length === 0) {
        replaceChildren(
          body,
          h("div", { className: "jr-empty" }, "No components match."),
        );
        return;
      }
      replaceChildren(body, items.map(renderComponent));
    } else {
      const items = display.actions.filter(
        (a) => !filter || a.name.toLowerCase().includes(filter),
      );
      if (items.length === 0) {
        replaceChildren(
          body,
          h("div", { className: "jr-empty" }, "No actions match."),
        );
        return;
      }
      replaceChildren(body, items.map(renderAction));
    }
  }

  function render() {
    updateToolbarChrome();
    renderBody();
  }

  render();
  return { update: render };
}

function renderComponent(c: CatalogComponentInfo): HTMLElement {
  return h(
    "div",
    { className: "jr-catalog-item" },
    h("div", { className: "jr-catalog-name" }, c.name),
    c.description
      ? h("div", { className: "jr-catalog-desc" }, c.description)
      : null,
    c.props.length > 0 || c.events.length > 0
      ? h(
          "div",
          { className: "jr-chips" },
          ...c.props.map((p) =>
            h(
              "span",
              { className: "jr-chip", "data-tone": "prop" },
              `${p.name}: ${p.type}`,
            ),
          ),
          ...c.events.map((e) =>
            h(
              "span",
              { className: "jr-chip", "data-tone": "event" },
              `on.${e}`,
            ),
          ),
        )
      : null,
  );
}

function renderAction(a: CatalogActionInfo): HTMLElement {
  return h(
    "div",
    { className: "jr-catalog-item" },
    h("div", { className: "jr-catalog-name" }, a.name),
    a.description
      ? h("div", { className: "jr-catalog-desc" }, a.description)
      : null,
    a.params.length > 0
      ? h(
          "div",
          { className: "jr-chips" },
          ...a.params.map((p) =>
            h(
              "span",
              { className: "jr-chip", "data-tone": "param" },
              `${p.name}: ${p.type}`,
            ),
          ),
        )
      : null,
  );
}

/**
 * Extract display data from a raw catalog definition. Handles both Zod v3
 * (`_def.shape()`) and v4 (`shape` getter). Resilient to missing fields.
 *
 * Same logic as `apps/web/lib/render/catalog-display.ts` but lives here
 * so framework adapters don't depend on the web app.
 */
export function buildCatalogDisplayData(rawCatalogData: unknown): {
  components: CatalogComponentInfo[];
  actions: CatalogActionInfo[];
} {
  const raw = (rawCatalogData ?? {}) as Record<string, unknown>;
  const componentsRaw = (raw.components ?? {}) as Record<string, unknown>;
  const actionsRaw = (raw.actions ?? {}) as Record<string, unknown>;

  const components: CatalogComponentInfo[] = Object.entries(componentsRaw)
    .map(([name, def]) => {
      const d = (def ?? {}) as Record<string, unknown>;
      return {
        name,
        description: (d.description as string) ?? "",
        props: extractFields(d.props),
        slots: Array.isArray(d.slots) ? (d.slots as string[]) : [],
        events: Array.isArray(d.events) ? (d.events as string[]) : [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const actions: CatalogActionInfo[] = Object.entries(actionsRaw)
    .map(([name, def]) => {
      const d = (def ?? {}) as Record<string, unknown>;
      return {
        name,
        description: (d.description as string) ?? "",
        params: extractFields(d.params),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { components, actions };
}

function extractFields(zodObj: unknown): CatalogField[] {
  if (!zodObj) return [];
  try {
    const obj = zodObj as Record<string, unknown>;
    const shape =
      typeof obj.shape === "object" && obj.shape !== null
        ? (obj.shape as Record<string, unknown>)
        : typeof (obj as { _def?: { shape?: unknown } })._def?.shape ===
            "function"
          ? (
              obj as { _def: { shape: () => Record<string, unknown> } }
            )._def.shape()
          : typeof (obj as { _def?: { shape?: unknown } })._def?.shape ===
              "object"
            ? (obj as { _def: { shape: Record<string, unknown> } })._def.shape
            : null;
    if (!shape) return [];

    return Object.entries(shape).map(([name, schema]) => {
      let type = "unknown";
      try {
        const s = schema as {
          _zod?: {
            def?: { type?: string; values?: unknown[]; innerType?: unknown };
          };
          _def?: { typeName?: string; values?: unknown[]; innerType?: unknown };
        };
        const typeName: string = s?._zod?.def?.type ?? s?._def?.typeName ?? "";
        if (typeName.includes("string")) type = "string";
        else if (typeName.includes("number")) type = "number";
        else if (typeName.includes("boolean")) type = "boolean";
        else if (typeName.includes("array")) type = "array";
        else if (typeName.includes("enum")) {
          const values = s?._zod?.def?.values ?? s?._def?.values;
          type = Array.isArray(values) ? values.join(" | ") : "enum";
        } else if (typeName.includes("union")) type = "union";
        else if (typeName.includes("nullable")) {
          const inner = (s?._zod?.def?.innerType ?? s?._def?.innerType) as
            | {
                _zod?: { def?: { type?: string; values?: unknown[] } };
                _def?: { typeName?: string; values?: unknown[] };
              }
            | undefined;
          const innerName: string =
            inner?._zod?.def?.type ?? inner?._def?.typeName ?? "";
          if (innerName.includes("string")) type = "string?";
          else if (innerName.includes("number")) type = "number?";
          else if (innerName.includes("boolean")) type = "boolean?";
          else if (innerName.includes("array")) type = "array?";
          else if (innerName.includes("enum")) {
            const values = inner?._zod?.def?.values ?? inner?._def?.values;
            type = Array.isArray(values) ? `(${values.join(" | ")})?` : "enum?";
          } else type = "optional";
        }
      } catch {
        // ignore
      }
      return { name, type };
    });
  } catch {
    return [];
  }
}
