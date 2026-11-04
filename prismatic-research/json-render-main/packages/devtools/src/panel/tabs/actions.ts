import { formatTime, h, jsonPreview, replaceChildren } from "../dom";
import type { DevtoolsEvent } from "../../types";
import type { PanelContext, TabDef, TabInstance } from "../types";

const TAB_ID = "actions";

interface ActionRow {
  id: string;
  name: string;
  params?: unknown;
  dispatchedAt: number;
  settledAt?: number;
  durationMs?: number;
  ok?: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Action Log tab — chronologically ordered list of dispatched actions.
 * Each dispatch is paired with its settle event (by `id`) to show
 * duration + success/failure.
 */
export function actionsTab(): TabDef {
  return {
    id: TAB_ID,
    label: "Actions",
    badge(ctx) {
      const rows = foldActions(ctx.events.snapshot()).length;
      return rows || undefined;
    },
    mount(root, ctx) {
      return mountActionsTab(root, ctx);
    },
  };
}

function mountActionsTab(root: HTMLElement, ctx: PanelContext): TabInstance {
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
  const expanded = new Set<string>();

  // Toolbar nodes are created once so the search input keeps focus + caret
  // position across every re-render. Only the dynamic bits (count badge
  // text) are updated imperatively.
  const searchInput = h("input", {
    className: "jr-search",
    type: "text",
    placeholder: "Filter by action name\u2026",
    onInput: (ev: Event) => {
      filter = ((ev.target as HTMLInputElement).value || "").toLowerCase();
      renderBody();
    },
  }) as HTMLInputElement;
  const countBadge = h("span", { className: "jr-badge" }, "0 actions");
  const clearBtn = h(
    "button",
    {
      className: "jr-icon-btn",
      title: "Clear action log",
      onClick: () => {
        // Only clears action events to preserve other history.
        const keep = ctx.events
          .snapshot()
          .filter(
            (e) =>
              e.kind !== "action-dispatched" && e.kind !== "action-settled",
          );
        ctx.events.clear();
        for (const e of keep) ctx.events.push(e);
      },
    },
    "clear",
  );
  toolbar.append(searchInput, countBadge, clearBtn);

  function renderBody() {
    const rows = foldActions(ctx.events.snapshot())
      .filter((r) => !filter || r.name.toLowerCase().includes(filter))
      .reverse(); // newest first

    countBadge.textContent = `${rows.length} action${rows.length === 1 ? "" : "s"}`;

    if (rows.length === 0) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "jr-empty" },
          filter
            ? "No actions match the filter."
            : "No actions dispatched yet.",
        ),
      );
      return;
    }

    replaceChildren(
      body,
      rows.map((r) => renderRow(r, expanded, renderBody)),
    );
  }

  renderBody();

  return { update: renderBody };
}

function foldActions(events: DevtoolsEvent[]): ActionRow[] {
  const byId = new Map<string, ActionRow>();
  const order: string[] = [];
  for (const evt of events) {
    if (evt.kind === "action-dispatched") {
      if (byId.has(evt.id)) continue;
      byId.set(evt.id, {
        id: evt.id,
        name: evt.name,
        params: evt.params,
        dispatchedAt: evt.at,
      });
      order.push(evt.id);
    } else if (evt.kind === "action-settled") {
      const row = byId.get(evt.id);
      if (!row) continue;
      row.settledAt = evt.at;
      row.durationMs = evt.durationMs;
      row.ok = evt.ok;
      row.result = evt.result;
      row.error = evt.error;
    }
  }
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

function renderRow(
  row: ActionRow,
  expanded: Set<string>,
  refresh: () => void,
): HTMLElement {
  const isExpanded = expanded.has(row.id);
  const pending = row.settledAt === undefined;
  const tone = pending ? "amber" : row.ok ? "green" : "red";
  const status = pending ? "pending" : row.ok ? "ok" : "error";
  const duration =
    row.durationMs !== undefined ? `${row.durationMs.toFixed(0)}ms` : "";

  const rowEl = h(
    "div",
    {
      className: "jr-row",
      onClick: () => {
        if (isExpanded) expanded.delete(row.id);
        else expanded.add(row.id);
        refresh();
      },
    },
    h("span", { className: "jr-row-time" }, formatTime(row.dispatchedAt)),
    h(
      "span",
      { className: "jr-row-main" },
      h("strong", null, row.name),
      row.params !== undefined
        ? h(
            "span",
            { className: "jr-tree-summary", style: { marginLeft: "8px" } },
            jsonPreview(row.params, 80),
          )
        : null,
    ),
    h(
      "span",
      { className: "jr-row-meta" },
      h("span", { className: "jr-badge", "data-tone": tone }, status),
      duration ? h("span", { style: { marginLeft: "6px" } }, duration) : null,
    ),
  );

  if (!isExpanded) return rowEl;

  const container = h("div", null, rowEl);
  container.appendChild(
    h(
      "div",
      { className: "jr-row-expanded" },
      h("h4", null, "Params"),
      h("pre", null, JSON.stringify(row.params ?? null, null, 2)),
      row.ok === false
        ? [
            h("h4", null, "Error"),
            h("pre", null, row.error ?? "(unknown error)"),
          ]
        : null,
      row.result !== undefined && row.ok !== false
        ? [
            h("h4", null, "Result"),
            h("pre", null, JSON.stringify(row.result, null, 2)),
          ]
        : null,
    ),
  );
  return container;
}
