import type { Spec, UIElement } from "@json-render/core";
import { validateSpec, type SpecIssue } from "@json-render/core";
import { setHoverHighlight } from "../../picker";
import { h, jsonPreview, replaceChildren } from "../dom";
import type { PanelContext, SpecEntry, TabDef, TabInstance } from "../types";

const TAB_ID = "spec";

/** Tree view icon (lucide list-tree). */
const VIEW_TREE_SVG = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12h-8"/>
  <path d="M21 6H8"/>
  <path d="M21 18h-8"/>
  <path d="M3 6v4c0 1.1.9 2 2 2h3"/>
  <path d="M3 10v6c0 1.1.9 2 2 2h3"/>
</svg>`;

/** Raw JSON view icon (lucide braces). */
const VIEW_RAW_SVG = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/>
  <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>
</svg>`;

/**
 * Spec Tree tab — renders the element tree with expand/collapse, shows a
 * one-line summary per node, and highlights structural issues from
 * `validateSpec`. Selecting a node fills the right-hand detail pane with
 * full props + metadata.
 */
export function specTab(): TabDef {
  return {
    id: TAB_ID,
    label: "Spec",
    badge(ctx) {
      const spec = ctx.getSpec();
      if (!spec) return undefined;
      return Object.keys(spec.elements).length || undefined;
    },
    mount(root, ctx) {
      return mountSpecTab(root, ctx);
    },
  };
}

function mountSpecTab(root: HTMLElement, ctx: PanelContext): TabInstance {
  const expanded = new Set<string>();
  // Make the tree pane keyboard-navigable (Chrome-DevTools / WAI-ARIA tree
  // behaviour). Arrow keys move/expand/collapse, Enter toggles, Home/End
  // jump to ends.
  const treePane = h("div", {
    className: "jr-split-left",
    role: "tree",
    tabindex: "0",
  });
  // Generation switcher — only rendered when the host exposes >1 spec
  // (typical in AI chats where each assistant message has its own spec).
  //
  // `selectedSpecId` always holds the id of the spec the user is viewing.
  // We track the previously-observed latest id separately so we can keep
  // the tab "sticky-to-latest" automatically: if the user is currently on
  // whatever was the newest generation, a newly-arrived generation slides
  // them forward to that one; otherwise their explicit pick is preserved.
  const generationBar = h("div", {
    className: "jr-generations",
    "aria-label": "Spec generation",
  });
  let selectedSpecId: string | null = null;
  let lastSeenLatestId: string | null = null;

  // Breadcrumb bar (root → selected) pinned above the scrollable rows so
  // it stays visible while the tree scrolls. The left half is the crumb
  // trail (clickable ancestors); the right half is a toggle between tree
  // and raw-JSON views.
  const breadcrumbs = h("nav", {
    className: "jr-breadcrumbs",
    "aria-label": "Selected element ancestors",
  });
  const crumbTrail = h("div", { className: "jr-breadcrumbs-trail" });
  const viewTools = h("div", {
    className: "jr-breadcrumbs-tools",
    role: "group",
    "aria-label": "Spec view",
  });
  const treeViewBtn = h("button", {
    className: "jr-view-btn",
    type: "button",
    title: "Tree view",
    "aria-label": "Tree view",
    "data-active": "true",
    onClick: () => setView("tree"),
  });
  treeViewBtn.innerHTML = VIEW_TREE_SVG;
  const rawViewBtn = h("button", {
    className: "jr-view-btn",
    type: "button",
    title: "Raw JSON view",
    "aria-label": "Raw JSON view",
    "data-active": "false",
    onClick: () => setView("raw"),
  });
  rawViewBtn.innerHTML = VIEW_RAW_SVG;
  viewTools.append(treeViewBtn, rawViewBtn);
  breadcrumbs.append(crumbTrail, viewTools);

  const treeRows = h("div", { className: "jr-tree-rows" });
  treePane.append(generationBar, breadcrumbs, treeRows);
  const detailPane = h("div", { className: "jr-split-right" });
  root.appendChild(h("div", { className: "jr-split" }, treePane, detailPane));

  let view: "tree" | "raw" = "tree";
  function setView(next: "tree" | "raw") {
    if (view === next) return;
    view = next;
    treeViewBtn.dataset.active = String(view === "tree");
    rawViewBtn.dataset.active = String(view === "raw");
    render();
  }

  // When the user picks an element that lives in a *different* generation
  // than the one currently being inspected (common in multi-renderer
  // apps), auto-switch the generation so the tree can actually show it.
  const unsubSelection = ctx.selection.subscribe(() => {
    const key = ctx.selection.get();
    if (key) {
      const { spec, generations } = resolveCurrentSpec();
      if (spec && !spec.elements[key] && generations.length > 1) {
        const match = generations.find((g) => g.spec.elements[key]);
        if (match) selectedSpecId = match.id;
      }
    }
    render();
  });

  // Safety net: if the whole tree container loses the pointer, clear any
  // lingering hover highlight. Individual row mouseleave handles the
  // common case, but this catches fast tree re-renders where the row the
  // cursor was over has been unmounted without firing its own leave.
  const onTreeLeave = () => setHoverHighlight(null);
  treePane.addEventListener("mouseleave", onTreeLeave);

  // Flat list of currently-visible element keys in render order. Populated
  // by `render()` and consumed by the arrow-key navigator.
  let visibleKeys: string[] = [];

  function toggleExpanded(key: string) {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    render();
  }

  function scrollSelectedIntoView() {
    const el = treePane.querySelector<HTMLElement>(
      '.jr-tree-row[data-selected="true"]',
    );
    el?.scrollIntoView({ block: "nearest" });
  }

  function moveSelection(nextKey: string | null | undefined) {
    if (!nextKey) return;
    ctx.selection.set(nextKey);
    setHoverHighlight(nextKey);
    // Selection subscriber has already re-rendered at this point.
    scrollSelectedIntoView();
  }

  function onKeyDown(ev: KeyboardEvent) {
    // Raw view is just a <pre> — let the browser handle text selection /
    // default keyboard behaviour. Tree nav doesn't apply there.
    if (view === "raw") return;
    // Ignore modifier-qualified keypresses so devtools hotkeys still work.
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const key = ev.key;
    if (
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "Enter" &&
      key !== " " &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }

    // Keyboard nav must operate on the spec the user is inspecting, not
    // necessarily the latest one.
    const { spec } = resolveCurrentSpec();
    if (!spec || visibleKeys.length === 0) return;

    const current = ctx.selection.get();
    const idx = current ? visibleKeys.indexOf(current) : -1;
    ev.preventDefault();

    if (key === "ArrowDown") {
      if (idx < 0) moveSelection(visibleKeys[0]);
      else
        moveSelection(visibleKeys[Math.min(idx + 1, visibleKeys.length - 1)]);
      return;
    }

    if (key === "ArrowUp") {
      if (idx < 0) moveSelection(visibleKeys[0]);
      else moveSelection(visibleKeys[Math.max(idx - 1, 0)]);
      return;
    }

    if (key === "Home") {
      moveSelection(visibleKeys[0]);
      return;
    }

    if (key === "End") {
      moveSelection(visibleKeys[visibleKeys.length - 1]);
      return;
    }

    if (key === "ArrowRight") {
      if (!current) {
        moveSelection(visibleKeys[0]);
        return;
      }
      const el = spec.elements[current];
      const childKeys = getChildKeys(el);
      const hasChildren = childKeys.length > 0;
      if (!hasChildren) return;
      if (!expanded.has(current)) {
        expanded.add(current);
        render();
        // Stay on the same row; the row just became expandable.
        scrollSelectedIntoView();
      } else {
        // Already expanded → step into the first child.
        moveSelection(childKeys[0]);
      }
      return;
    }

    if (key === "ArrowLeft") {
      if (!current) return;
      const el = spec.elements[current];
      const hasChildren = getChildKeys(el).length > 0;
      if (hasChildren && expanded.has(current)) {
        expanded.delete(current);
        render();
        scrollSelectedIntoView();
      } else {
        const parent = findParent(spec, current);
        if (parent) moveSelection(parent);
      }
      return;
    }

    // Enter / Space
    if (!current) {
      moveSelection(visibleKeys[0]);
      return;
    }
    const el = spec.elements[current];
    if (getChildKeys(el).length > 0) {
      toggleExpanded(current);
      scrollSelectedIntoView();
    }
  }

  // Focus the tree pane when the user clicks into it so arrow keys take
  // effect right after a mouse pick. `focus()` without `preventScroll`
  // would jump the body on some browsers, so pass the option.
  const onFocusIn = () => {
    const current = ctx.selection.get();
    if (current) setHoverHighlight(current);
  };
  const onFocusOut = (ev: FocusEvent) => {
    // Only clear when focus leaves the tree entirely (not when moving
    // between rows). Shadow DOM + relatedTarget behaves like a normal
    // document for this check.
    const next = ev.relatedTarget as Node | null;
    if (!next || !treePane.contains(next)) {
      setHoverHighlight(null);
    }
  };

  // Focus the tree on mousedown so arrow keys work right after a click.
  // Passing `preventScroll` avoids the browser jumping the page if the
  // pane was off-screen.
  const onMouseDown = () => {
    try {
      treePane.focus({ preventScroll: true });
    } catch {
      // Some environments (tests, ancient browsers) throw on focus().
    }
  };
  treePane.addEventListener("mousedown", onMouseDown);
  treePane.addEventListener("keydown", onKeyDown);
  treePane.addEventListener("focusin", onFocusIn);
  treePane.addEventListener("focusout", onFocusOut);

  /**
   * Resolve the spec the tab currently inspects, plus the full generations
   * list. When a new generation arrives and the user had been on what was
   * previously the newest, we slide forward to the new newest (sticky).
   * An explicit older pick is always preserved.
   */
  function resolveCurrentSpec(): {
    spec: Spec | null;
    generations: SpecEntry[];
  } {
    const generations = ctx.getSpecs?.() ?? [];
    if (generations.length === 0) {
      return { spec: ctx.getSpec(), generations };
    }
    const latest = generations[generations.length - 1]!;

    // First render, or our pick no longer exists (e.g. chat cleared):
    // default to the newest.
    if (
      selectedSpecId == null ||
      !generations.some((g) => g.id === selectedSpecId)
    ) {
      selectedSpecId = latest.id;
    } else if (
      lastSeenLatestId != null &&
      selectedSpecId === lastSeenLatestId &&
      lastSeenLatestId !== latest.id
    ) {
      // Sticky: we were on "what was newest last render"; follow forward.
      selectedSpecId = latest.id;
    }
    lastSeenLatestId = latest.id;

    const picked = generations.find((g) => g.id === selectedSpecId)!;
    return { spec: picked.spec, generations };
  }

  function renderGenerationBar(generations: SpecEntry[]) {
    if (generations.length < 2) {
      replaceChildren(generationBar, null);
      return;
    }
    const latestId = generations[generations.length - 1]!.id;
    const select = h(
      "select",
      {
        className: "jr-generation-select",
        "aria-label": "Inspect generation",
        onChange: (ev: Event) => {
          selectedSpecId = (ev.target as HTMLSelectElement).value;
          render();
        },
      },
      ...generations.map((g, i) =>
        h(
          "option",
          {
            value: g.id,
            selected: g.id === selectedSpecId ? "true" : undefined,
          },
          g.id === latestId ? `Gen ${i + 1} (latest)` : `Gen ${i + 1}`,
        ),
      ),
    );
    const count = h(
      "span",
      { className: "jr-generations-count" },
      `${generations.length} generation${generations.length === 1 ? "" : "s"}`,
    );
    replaceChildren(generationBar, select, count);
  }

  function render() {
    const { spec, generations } = resolveCurrentSpec();
    renderGenerationBar(generations);
    if (!spec || !spec.root || Object.keys(spec.elements).length === 0) {
      visibleKeys = [];
      renderBreadcrumbs(null, null);
      replaceChildren(
        treeRows,
        h("div", { className: "jr-empty" }, "No spec attached."),
      );
      replaceChildren(detailPane, null);
      return;
    }

    const issues = collectIssues(spec);
    const selected = ctx.selection.get();

    // Auto-expand the path to the selection so it is always visible.
    // `findPath` returns leaf-first; we'll flip it for the breadcrumb bar.
    const pathLeafFirst = selected ? findPath(spec, selected) : [];
    for (const k of pathLeafFirst) expanded.add(k);

    visibleKeys = collectVisibleKeys(spec, expanded);

    renderBreadcrumbs(spec, pathLeafFirst);

    if (view === "raw") {
      renderRaw(spec);
    } else {
      replaceChildren(
        treeRows,
        renderNode(
          spec,
          spec.root,
          0,
          expanded,
          selected,
          issues,
          ctx,
          toggleExpanded,
          null,
        ),
      );
    }

    if (selected && spec.elements[selected]) {
      renderDetail(detailPane, spec, selected, issues);
    } else {
      replaceChildren(
        detailPane,
        h("div", { className: "jr-empty" }, "Select an element to inspect."),
      );
    }
  }

  /**
   * Render the whole spec as pretty-printed JSON. Useful for copy/paste
   * into issue reports or quick source-level scans.
   */
  function renderRaw(spec: Spec) {
    let text: string;
    try {
      text = JSON.stringify(spec, null, 2);
    } catch {
      text = String(spec);
    }
    replaceChildren(treeRows, h("pre", { className: "jr-raw" }, text));
  }

  /**
   * Rebuild the crumb trail inside the breadcrumb bar.
   * `pathLeafFirst` is the output of `findPath` (leaf → root); we render
   * it root → leaf. The view-toggle buttons on the right are untouched.
   */
  function renderBreadcrumbs(
    spec: Spec | null,
    pathLeafFirst: string[] | null,
  ) {
    if (!spec || !pathLeafFirst || pathLeafFirst.length === 0) {
      replaceChildren(
        crumbTrail,
        h("span", { className: "jr-breadcrumbs-empty" }, "No element selected"),
      );
      return;
    }
    const path = [...pathLeafFirst].reverse();
    const parts: Array<HTMLElement | null> = [];
    path.forEach((key, i) => {
      const el = spec.elements[key];
      const label = el?.type ?? "<missing>";
      const isCurrent = i === path.length - 1;
      const crumb = h(
        "button",
        {
          className: "jr-breadcrumb",
          type: "button",
          "data-current": String(isCurrent),
          title: `#${key}`,
          onClick: (ev: MouseEvent) => {
            ev.stopPropagation();
            ctx.selection.set(key);
            setHoverHighlight(key);
          },
          onMouseEnter: () => setHoverHighlight(key),
          onMouseLeave: () => setHoverHighlight(null),
        },
        label,
      );
      parts.push(crumb);
      if (!isCurrent) {
        parts.push(h("span", { className: "jr-breadcrumb-sep" }, "\u25b8"));
      }
    });
    replaceChildren(crumbTrail, parts);
  }

  render();

  return {
    update: render,
    destroy() {
      unsubSelection();
      treePane.removeEventListener("mouseleave", onTreeLeave);
      treePane.removeEventListener("mousedown", onMouseDown);
      treePane.removeEventListener("keydown", onKeyDown);
      treePane.removeEventListener("focusin", onFocusIn);
      treePane.removeEventListener("focusout", onFocusOut);
      setHoverHighlight(null);
    },
  };
}

/**
 * Flatten `spec` into the ordered list of element keys currently visible
 * in the tree, respecting the `expanded` set. Used to drive arrow-key
 * navigation.
 */
function collectVisibleKeys(spec: Spec, expanded: Set<string>): string[] {
  const list: string[] = [];
  function walk(key: string) {
    list.push(key);
    const el = spec.elements[key];
    const childKeys = getChildKeys(el);
    if (childKeys.length === 0) return;
    if (!expanded.has(key)) return;
    for (const child of childKeys) walk(child);
  }
  walk(spec.root);
  return list;
}

function findParent(spec: Spec, key: string): string | null {
  for (const [parentKey, el] of Object.entries(spec.elements)) {
    if (getChildKeys(el).includes(key)) return parentKey;
  }
  return null;
}

function getChildKeys(element: UIElement | undefined): string[] {
  if (!element) return [];
  return [
    ...(element.children ?? []),
    ...Object.values(element.slots ?? {}).flat(),
  ];
}

interface IssueIndex {
  all: SpecIssue[];
  byKey: Map<string, SpecIssue[]>;
}

function collectIssues(spec: Spec): IssueIndex {
  const result = validateSpec(spec, { checkOrphans: true });
  const byKey = new Map<string, SpecIssue[]>();
  for (const issue of result.issues) {
    const k = issue.elementKey ?? "__spec__";
    const arr = byKey.get(k) ?? [];
    arr.push(issue);
    byKey.set(k, arr);
  }
  return { all: result.issues, byKey };
}

/**
 * Walk the tree looking for `key` and return the ancestor path
 * (inclusive) so a caller can expand it.
 */
function findPath(spec: Spec, key: string): string[] {
  const path: string[] = [];
  function walk(current: string): boolean {
    if (current === key) {
      path.push(current);
      return true;
    }
    const el = spec.elements[current];
    for (const child of getChildKeys(el)) {
      if (walk(child)) {
        path.push(current);
        return true;
      }
    }
    return false;
  }
  walk(spec.root);
  return path;
}

function renderNode(
  spec: Spec,
  key: string,
  depth: number,
  expanded: Set<string>,
  selected: string | null,
  issues: IssueIndex,
  ctx: PanelContext,
  onToggle: (key: string) => void,
  parentHidden: boolean | null,
): HTMLElement | null {
  const el = spec.elements[key];
  if (!el) {
    return h(
      "div",
      {
        className: "jr-tree-row",
        style: { paddingLeft: `${12 + depth * 14}px` },
      },
      h("span", { className: "jr-tree-toggle" }, " "),
      h("span", { className: "jr-tree-type" }, "<missing>"),
      h("span", { className: "jr-tree-key" }, key),
    );
  }

  const childKeys = getChildKeys(el);
  const hasChildren = childKeys.length > 0;
  const isExpanded = hasChildren && expanded.has(key);
  const isSelected = selected === key;
  const elementIssues = issues.byKey.get(key) ?? [];
  const hasErrors = elementIssues.some((i) => i.severity === "error");
  const summary = makeSummary(el);
  const hiddenHere = el.visible !== undefined ? null : parentHidden;

  const row = h(
    "div",
    {
      className: `jr-tree-row${hiddenHere === true ? " jr-tree-hidden" : ""}`,
      "data-selected": String(isSelected),
      style: { paddingLeft: `${8 + depth * 14}px` },
      onClick: (ev: MouseEvent) => {
        ev.stopPropagation();
        ctx.selection.set(key);
      },
      // Paint a persistent bounding-box overlay over the matching DOM
      // element while the tree row is hovered — gives the same visual
      // affordance as Chrome DevTools' element picker without needing to
      // enter pick mode.
      onMouseEnter: () => {
        setHoverHighlight(key);
      },
      onMouseLeave: () => {
        setHoverHighlight(null);
      },
    },
    h(
      "span",
      {
        className: "jr-tree-toggle",
        onClick: (ev: MouseEvent) => {
          ev.stopPropagation();
          if (hasChildren) onToggle(key);
        },
      },
      hasChildren ? (isExpanded ? "\u25be" : "\u25b8") : " ",
    ),
    h("span", { className: "jr-tree-type" }, el.type),
    h("span", { className: "jr-tree-key" }, `#${key}`),
    summary ? h("span", { className: "jr-tree-summary" }, summary) : null,
    el.visible !== undefined
      ? h("span", { className: "jr-badge", "data-tone": "amber" }, "visible")
      : null,
    el.repeat
      ? h("span", { className: "jr-badge", "data-tone": "accent" }, "repeat")
      : null,
    hasErrors
      ? h(
          "span",
          {
            className: "jr-badge",
            "data-tone": "red",
            title: elementIssues.map((i) => i.message).join("\n"),
          },
          `${elementIssues.length}`,
        )
      : null,
  );

  const container = h("div", null, row);

  if (isExpanded && hasChildren) {
    for (const childKey of childKeys) {
      const childNode = renderNode(
        spec,
        childKey,
        depth + 1,
        expanded,
        selected,
        issues,
        ctx,
        onToggle,
        hiddenHere,
      );
      if (childNode) container.appendChild(childNode);
    }
  }

  return container;
}

/**
 * Produce a very short human-readable summary of a node's props. Prefers
 * common fields ("title", "label", "text", "name") and falls back to the
 * first scalar prop.
 */
function makeSummary(el: UIElement): string | null {
  const props = el.props as Record<string, unknown> | undefined;
  if (!props) return null;
  const prefer = ["title", "label", "text", "name", "value", "status"];
  for (const p of prefer) {
    const v = props[p];
    if (typeof v === "string" && v.length > 0) return shorten(v, 60);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  for (const [, v] of Object.entries(props)) {
    if (typeof v === "string" && v.length > 0) return shorten(v, 60);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return null;
}

function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function renderDetail(
  container: HTMLElement,
  spec: Spec,
  key: string,
  issues: IssueIndex,
) {
  const el = spec.elements[key];
  if (!el) {
    replaceChildren(
      container,
      h("div", { className: "jr-empty" }, `Element '${key}' not found.`),
    );
    return;
  }

  const elIssues = issues.byKey.get(key) ?? [];
  const children = getChildKeys(el).length;

  replaceChildren(
    container,
    h(
      "div",
      { className: "jr-detail" },
      h("h4", null, "Element"),
      h(
        "div",
        { style: { marginBottom: "10px" } },
        h("span", { className: "jr-tree-type" }, el.type),
        " ",
        h("span", { className: "jr-tree-key" }, `#${key}`),
        "  ",
        h(
          "span",
          { className: "jr-tree-summary" },
          `${children} child${children === 1 ? "" : "ren"}`,
        ),
      ),
      elIssues.length > 0
        ? [
            h("h4", null, "Issues"),
            ...elIssues.map((issue) =>
              h(
                "div",
                {
                  className: "jr-badge",
                  "data-tone": issue.severity === "error" ? "red" : "amber",
                  style: {
                    marginBottom: "6px",
                    display: "block",
                    padding: "4px 8px",
                  },
                },
                `${issue.severity.toUpperCase()}: ${issue.message}`,
              ),
            ),
          ]
        : null,
      el.visible !== undefined
        ? [
            h("h4", null, "Visibility"),
            h("pre", null, jsonPreview(el.visible, 2000)),
          ]
        : null,
      el.on && Object.keys(el.on).length > 0
        ? [h("h4", null, "Events"), h("pre", null, jsonPreview(el.on, 2000))]
        : null,
      el.watch && Object.keys(el.watch).length > 0
        ? [
            h("h4", null, "Watchers"),
            h("pre", null, jsonPreview(el.watch, 2000)),
          ]
        : null,
      el.repeat
        ? [
            h("h4", null, "Repeat"),
            h("pre", null, jsonPreview(el.repeat, 2000)),
          ]
        : null,
      h("h4", null, "Props"),
      h("pre", null, JSON.stringify(el.props, null, 2)),
    ),
  );
}
