import { formatTime, h, jsonPreview, replaceChildren } from "../dom";
import type { DevtoolsEvent, TokenUsage } from "../../types";
import type { PanelContext, TabDef, TabInstance } from "../types";

const TAB_ID = "stream";

interface Generation {
  startedAt: number;
  endedAt?: number;
  ok?: boolean;
  events: DevtoolsEvent[];
  usage?: TokenUsage;
}

/**
 * Stream Log tab — shows spec patches, text chunks, lifecycle markers,
 * and token usage grouped by generation (lifecycle start -> end).
 */
export function streamTab(): TabDef {
  return {
    id: TAB_ID,
    label: "Stream",
    badge(ctx) {
      const gens = groupGenerations(ctx.events.snapshot());
      return gens.length || undefined;
    },
    mount(root, ctx) {
      return mountStreamTab(root, ctx);
    },
  };
}

function mountStreamTab(root: HTMLElement, ctx: PanelContext): TabInstance {
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

  function render() {
    const all = ctx.events.snapshot();
    const gens = groupGenerations(all);
    const orphan = collectOrphanEvents(all);

    replaceChildren(
      toolbar,
      h(
        "span",
        { className: "jr-badge" },
        `${gens.length} generation${gens.length === 1 ? "" : "s"}`,
      ),
    );

    if (gens.length === 0 && orphan.length === 0) {
      replaceChildren(
        body,
        h(
          "div",
          { className: "jr-empty" },
          "No stream events yet. Tap a stream or pass messages to capture patches.",
        ),
      );
      return;
    }

    const content: HTMLElement[] = [];
    // Newest first; flatten orphan into a pseudo-generation.
    if (orphan.length > 0) {
      content.push(
        renderGeneration(
          { startedAt: orphan[0]?.at ?? Date.now(), events: orphan },
          "live",
          true,
        ),
      );
    }
    for (let i = gens.length - 1; i >= 0; i--) {
      const gen = gens[i]!;
      content.push(renderGeneration(gen, `gen-${i}`, i === gens.length - 1));
    }
    replaceChildren(body, content);
  }

  render();
  return { update: render };
}

function groupGenerations(events: DevtoolsEvent[]): Generation[] {
  const gens: Generation[] = [];
  let current: Generation | null = null;
  for (const evt of events) {
    if (evt.kind === "stream-lifecycle") {
      if (evt.phase === "start") {
        if (current) gens.push(current);
        current = { startedAt: evt.at, events: [] };
      } else {
        if (!current) {
          current = { startedAt: evt.at, events: [] };
        }
        current.endedAt = evt.at;
        current.ok = evt.ok;
        gens.push(current);
        current = null;
      }
      continue;
    }
    if (
      evt.kind === "stream-patch" ||
      evt.kind === "stream-text" ||
      evt.kind === "stream-usage"
    ) {
      if (!current) current = { startedAt: evt.at, events: [] };
      current.events.push(evt);
      if (evt.kind === "stream-usage") current.usage = evt.usage;
    }
  }
  if (current) gens.push(current);
  return gens;
}

/**
 * Stream events recorded outside any lifecycle pair (e.g. when the app taps
 * message parts without emitting explicit start/end markers).
 */
function collectOrphanEvents(events: DevtoolsEvent[]): DevtoolsEvent[] {
  const hasAnyLifecycle = events.some((e) => e.kind === "stream-lifecycle");
  if (hasAnyLifecycle) return [];
  return events.filter(
    (e) =>
      e.kind === "stream-patch" ||
      e.kind === "stream-text" ||
      e.kind === "stream-usage",
  );
}

function renderGeneration(
  gen: Generation,
  key: string,
  expandedByDefault: boolean,
): HTMLElement {
  const patchCount = gen.events.filter((e) => e.kind === "stream-patch").length;
  const textCount = gen.events.filter((e) => e.kind === "stream-text").length;
  const duration =
    gen.endedAt !== undefined ? gen.endedAt - gen.startedAt : undefined;
  const tone =
    gen.endedAt === undefined ? "amber" : gen.ok === false ? "red" : "green";
  const status =
    gen.endedAt === undefined ? "live" : gen.ok === false ? "error" : "done";

  const body = h(
    "div",
    {
      style: {
        borderTop: "1px solid var(--jr-border)",
        background: "var(--jr-bg-soft)",
        display: expandedByDefault ? "block" : "none",
      },
    },
    ...gen.events.map(renderStreamEvent),
  );

  const header = h(
    "div",
    {
      className: "jr-row",
      style: { cursor: "pointer" },
      onClick: () => {
        body.style.display = body.style.display === "none" ? "block" : "none";
      },
    },
    h("span", { className: "jr-row-time" }, formatTime(gen.startedAt)),
    h(
      "span",
      { className: "jr-row-main" },
      h("strong", null, `generation #${key}`),
      h(
        "span",
        { className: "jr-tree-summary", style: { marginLeft: "8px" } },
        `${patchCount} patch${patchCount === 1 ? "" : "es"}`,
        textCount > 0
          ? `, ${textCount} text chunk${textCount === 1 ? "" : "s"}`
          : "",
      ),
    ),
    h(
      "span",
      { className: "jr-row-meta" },
      h("span", { className: "jr-badge", "data-tone": tone }, status),
      duration !== undefined
        ? h("span", { style: { marginLeft: "6px" } }, `${duration}ms`)
        : null,
      gen.usage
        ? h(
            "span",
            { style: { marginLeft: "6px" } },
            `${formatTokens(gen.usage.totalTokens)} tok`,
          )
        : null,
    ),
  );

  return h("div", null, header, body);
}

function renderStreamEvent(evt: DevtoolsEvent): HTMLElement {
  if (evt.kind === "stream-patch") {
    return h(
      "div",
      { className: "jr-row" },
      h("span", { className: "jr-row-time" }, formatTime(evt.at)),
      h(
        "span",
        { className: "jr-row-main" },
        h(
          "span",
          { className: "jr-badge", "data-tone": "accent" },
          evt.patch.op,
        ),
        h(
          "span",
          { className: "jr-tree-summary", style: { marginLeft: "8px" } },
          evt.patch.path,
          evt.patch.value !== undefined
            ? ` = ${jsonPreview(evt.patch.value, 80)}`
            : "",
        ),
      ),
      h("span", { className: "jr-row-meta" }, evt.source),
    );
  }
  if (evt.kind === "stream-text") {
    return h(
      "div",
      { className: "jr-row" },
      h("span", { className: "jr-row-time" }, formatTime(evt.at)),
      h(
        "span",
        { className: "jr-row-main", style: { whiteSpace: "pre-wrap" } },
        evt.text,
      ),
      h(
        "span",
        { className: "jr-row-meta" },
        h("span", { className: "jr-badge" }, "text"),
      ),
    );
  }
  if (evt.kind === "stream-usage") {
    return h(
      "div",
      { className: "jr-row" },
      h("span", { className: "jr-row-time" }, formatTime(evt.at)),
      h(
        "span",
        { className: "jr-row-main" },
        `prompt ${formatTokens(evt.usage.promptTokens)} / completion ${formatTokens(
          evt.usage.completionTokens,
        )} / total ${formatTokens(evt.usage.totalTokens)}`,
      ),
      h(
        "span",
        { className: "jr-row-meta" },
        h("span", { className: "jr-badge", "data-tone": "accent" }, "usage"),
      ),
    );
  }
  return h("div");
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
