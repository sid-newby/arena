import { flattenToPointers } from "@json-render/core/store-utils";
import { h, jsonPreview, replaceChildren } from "../dom";
import type { PanelContext, TabDef, TabInstance } from "../types";

const TAB_ID = "state";

/**
 * State Inspector tab — lists every leaf path in the state model with an
 * inline editor. Editing a value re-parses it as JSON; if the input
 * doesn't parse, the raw string is used. Reads a snapshot from the
 * underlying StateStore on every render, plus on every state-set event.
 */
export function stateTab(): TabDef {
  return {
    id: TAB_ID,
    label: "State",
    badge(ctx) {
      const store = ctx.getStateStore();
      if (!store) return undefined;
      try {
        const flat = flattenToPointers(store.getSnapshot());
        const count = Object.keys(flat).length;
        return count || undefined;
      } catch {
        return undefined;
      }
    },
    mount(root, ctx) {
      return mountStateTab(root, ctx);
    },
  };
}

function mountStateTab(root: HTMLElement, ctx: PanelContext): TabInstance {
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

  let filter = "";
  // Tracks which paths are being edited so live state-set events don't clobber the input.
  const editing = new Set<string>();

  const searchInput = h("input", {
    className: "jr-search",
    type: "text",
    placeholder: "Filter paths\u2026",
    onInput: (ev: Event) => {
      filter = ((ev.target as HTMLInputElement).value || "").toLowerCase();
      renderBody();
    },
  });

  function renderToolbar() {
    replaceChildren(
      toolbar,
      searchInput,
      h(
        "button",
        {
          className: "jr-icon-btn",
          title: "Refresh state listing",
          onClick: () => renderBody(),
        },
        "refresh",
      ),
    );
  }

  function renderBody() {
    const store = ctx.getStateStore();
    if (!store) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "jr-empty" },
          "No StateStore attached. Devtools sees state once a provider mounts.",
        ),
      );
      return;
    }

    let flat: Record<string, unknown> = {};
    try {
      flat = flattenToPointers(store.getSnapshot());
    } catch (err) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "jr-empty" },
          `State read failed: ${String(err)}`,
        ),
      );
      return;
    }

    const entries = Object.entries(flat)
      .filter(([path]) => !filter || path.toLowerCase().includes(filter))
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "jr-empty" },
          filter ? "No paths match the filter." : "State is empty.",
        ),
      );
      return;
    }

    replaceChildren(
      body,
      entries.map(([path, value]) =>
        renderStateRow(path, value, store.set, editing),
      ),
    );
  }

  renderToolbar();
  renderBody();

  return {
    update() {
      // Only rebuild when nothing is actively being edited so focus /
      // caret position is preserved between re-renders.
      if (editing.size === 0) renderBody();
    },
  };
}

function renderStateRow(
  path: string,
  value: unknown,
  setValue: (path: string, value: unknown) => void,
  editing: Set<string>,
): HTMLElement {
  const input = h("input", {
    className: "jr-state-value",
    type: "text",
    value: stringifyValue(value),
    spellcheck: "false" as unknown as string,
    onFocus: () => {
      editing.add(path);
    },
    onBlur: (ev: FocusEvent) => {
      editing.delete(path);
      const raw = (ev.target as HTMLInputElement).value;
      try {
        const parsed = raw === "" ? "" : JSON.parse(raw);
        setValue(path, parsed);
        input.dataset.dirty = "false";
      } catch {
        setValue(path, raw);
        input.dataset.dirty = "false";
      }
    },
    onInput: () => {
      input.dataset.dirty = "true";
    },
    onKeyDown: (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        (ev.target as HTMLInputElement).blur();
      }
      if (ev.key === "Escape") {
        input.value = stringifyValue(value);
        input.dataset.dirty = "false";
        (ev.target as HTMLInputElement).blur();
      }
    },
  }) as HTMLInputElement;

  return h(
    "div",
    {
      className: "jr-state-row",
      title: `${path}\n${jsonPreview(value, 1000)}`,
    },
    h("span", { className: "jr-state-path" }, path),
    input,
  );
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
