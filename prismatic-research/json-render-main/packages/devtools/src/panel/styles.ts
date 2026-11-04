/**
 * CSS for the devtools panel. Injected into the shadow root so nothing
 * leaks into or out of the host app. Theme values are defined on `:host`
 * so tabs can read them via `var(--jr-*)`.
 *
 * Tokens mirror the json-render playground's visual language: small mono
 * type, muted borders, compact paddings.
 */
export const PANEL_CSS = `
:host {
  /* Light theme — default. Overridden by the dark-mode media query below
     so the panel follows the host OS's \`prefers-color-scheme\`. */
  --jr-bg: #ffffff;
  --jr-bg-muted: #f4f4f5;
  --jr-bg-soft: #fafafa;
  --jr-fg: #18181b;
  --jr-fg-muted: #52525b;
  --jr-fg-dim: #71717a;
  --jr-border: #e4e4e7;
  --jr-border-strong: #a1a1aa;
  --jr-accent: #2563eb;
  --jr-green: #16a34a;
  --jr-red: #dc2626;
  --jr-amber: #d97706;
  --jr-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --jr-font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
  all: initial;
  color-scheme: light dark;
  font-family: var(--jr-font-ui);
  color: var(--jr-fg);
  position: fixed;
  z-index: 2147483647;
}

@media (prefers-color-scheme: dark) {
  :host {
    --jr-bg: #09090b;
    --jr-bg-muted: #111113;
    --jr-bg-soft: #17171a;
    --jr-fg: #fafafa;
    --jr-fg-muted: #a1a1aa;
    --jr-fg-dim: #71717a;
    --jr-border: #27272a;
    --jr-border-strong: #3f3f46;
    --jr-accent: #60a5fa;
    --jr-green: #4ade80;
    --jr-red: #f87171;
    --jr-amber: #fbbf24;
  }
}

* {
  box-sizing: border-box;
}

button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 0;
}

/* Floating toggle — frosted dark-glass badge inspired by Next.js Dev Tools.
   Always dark regardless of OS \`prefers-color-scheme\` so the affordance
   reads the same on both light and dark hosts. */
.jr-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  background: rgba(0, 0, 0, 0.8);
  -webkit-backdrop-filter: blur(48px);
  backdrop-filter: blur(48px);
  color: #ffffff;
  /* Triple layer: outer hard ring, inner subtle highlight, drop shadow. */
  box-shadow:
    0 0 0 1px #171717,
    inset 0 0 0 1px hsla(0, 0%, 100%, 0.14),
    0 16px 32px -8px rgba(0, 0, 0, 0.24);
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: scale, background;
  transition:
    scale 150ms cubic-bezier(0.23, 0.88, 0.26, 0.92),
    background 150ms ease;
}
.jr-toggle[data-position="bottom-left"] { right: auto; left: 20px; }
.jr-toggle[data-position="right"] { bottom: auto; top: 20px; }
.jr-toggle:hover {
  background: rgba(20, 20, 20, 0.88);
}
.jr-toggle:active {
  scale: 0.95;
}
.jr-toggle[data-open="true"] {
  box-shadow:
    0 0 0 1px var(--jr-accent),
    inset 0 0 0 1px hsla(0, 0%, 100%, 0.14),
    0 16px 32px -8px rgba(0, 0, 0, 0.24);
}

.jr-panel {
  position: fixed;
  background: var(--jr-bg);
  color: var(--jr-fg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--jr-font-ui);
  font-size: 12px;
}

.jr-panel[data-dock="bottom"] {
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--jr-panel-height, 380px);
  min-height: 180px;
  max-height: 90vh;
  border-top: 1px solid var(--jr-border);
}

.jr-panel[data-dock="right"] {
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--jr-panel-width, 440px);
  min-width: 260px;
  max-width: 90vw;
  border-left: 1px solid var(--jr-border);
}

.jr-panel[data-hidden="true"] {
  display: none;
}

.jr-resize {
  position: absolute;
  z-index: 1;
}
.jr-panel[data-dock="bottom"] .jr-resize {
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
}
.jr-panel[data-dock="right"] .jr-resize {
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
}

.jr-header {
  display: flex;
  align-items: stretch;
  height: 36px;
  border-bottom: 1px solid var(--jr-border);
  flex-shrink: 0;
  background: var(--jr-bg);
}

.jr-title {
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-family: var(--jr-font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--jr-fg);
  border-right: 1px solid var(--jr-border);
  letter-spacing: 0.02em;
}
.jr-tabs {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}
.jr-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-family: var(--jr-font-mono);
  font-size: 11px;
  color: var(--jr-fg-muted);
  background: transparent;
  border-right: 1px solid var(--jr-border);
  white-space: nowrap;
  transition: color 0.1s ease, background 0.1s ease;
}
.jr-tab:hover {
  color: var(--jr-fg);
  background: var(--jr-bg-muted);
}
.jr-tab[data-active="true"] {
  color: var(--jr-fg);
  background: var(--jr-bg-muted);
  box-shadow: inset 0 -2px 0 var(--jr-accent);
}
.jr-tab-count {
  font-size: 10px;
  color: var(--jr-fg-dim);
  background: var(--jr-bg-soft);
  border-radius: 999px;
  padding: 1px 6px;
}

.jr-actions {
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
  border-left: 1px solid var(--jr-border);
}
.jr-icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--jr-fg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.jr-icon-btn:hover {
  color: var(--jr-fg);
  background: var(--jr-bg-muted);
}
.jr-icon-btn[data-active="true"] {
  color: var(--jr-accent);
  background: var(--jr-bg-muted);
}

.jr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.jr-body > .jr-tab-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.jr-empty {
  flex: 1;
  min-height: 80px;
  padding: 24px;
  color: var(--jr-fg-dim);
  font-size: 12px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* --- Rows / list primitives used by tabs --- */

.jr-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 4px 12px;
  border-bottom: 1px solid var(--jr-border);
  font-family: var(--jr-font-mono);
  font-size: 11px;
  cursor: pointer;
}
.jr-row:hover {
  background: var(--jr-bg-muted);
}
.jr-row-time {
  color: var(--jr-fg-dim);
  font-size: 10px;
  white-space: nowrap;
}
.jr-row-main {
  color: var(--jr-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jr-row-meta {
  color: var(--jr-fg-muted);
  font-size: 10px;
  white-space: nowrap;
}
.jr-row-expanded {
  grid-column: 1 / -1;
  padding: 8px 12px 10px 12px;
  color: var(--jr-fg-muted);
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--jr-bg-soft);
  border-top: 1px solid var(--jr-border);
}

.jr-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--jr-font-mono);
  font-size: 10px;
  color: var(--jr-fg-muted);
  background: var(--jr-bg-soft);
  border: 1px solid var(--jr-border);
}
.jr-badge[data-tone="green"] { color: var(--jr-green); border-color: rgba(74, 222, 128, 0.25); }
.jr-badge[data-tone="red"] { color: var(--jr-red); border-color: rgba(248, 113, 113, 0.25); }
.jr-badge[data-tone="amber"] { color: var(--jr-amber); border-color: rgba(251, 191, 36, 0.25); }
.jr-badge[data-tone="accent"] { color: var(--jr-accent); border-color: rgba(96, 165, 250, 0.25); }

.jr-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--jr-border);
  background: var(--jr-bg);
  font-family: var(--jr-font-mono);
  font-size: 10px;
  color: var(--jr-fg-muted);
  position: sticky;
  top: 0;
  z-index: 1;
}
.jr-toolbar .jr-icon-btn { width: auto; padding: 0 6px; font-size: 10px; }
.jr-search {
  flex: 1;
  background: var(--jr-bg-soft);
  border: 1px solid var(--jr-border);
  border-radius: 4px;
  padding: 3px 6px;
  color: var(--jr-fg);
  font-family: var(--jr-font-mono);
  font-size: 10px;
  outline: none;
}
.jr-search:focus {
  border-color: var(--jr-accent);
}

/* --- Spec tree --- */

.jr-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px;
  font-family: var(--jr-font-mono);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--jr-fg);
}
.jr-tree-row:hover {
  background: var(--jr-bg-muted);
}
.jr-tree-row[data-selected="true"] {
  background: var(--jr-bg-muted);
  box-shadow: inset 2px 0 0 var(--jr-accent);
}
.jr-tree-toggle {
  width: 12px;
  color: var(--jr-fg-dim);
  display: inline-block;
  text-align: center;
}
.jr-tree-type {
  color: var(--jr-accent);
  font-weight: 500;
}
.jr-tree-key {
  color: var(--jr-fg-dim);
  font-size: 10px;
}
.jr-tree-summary {
  color: var(--jr-fg-muted);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.jr-tree-hidden {
  opacity: 0.45;
}

.jr-split {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
}
.jr-split-left {
  flex: 1;
  min-width: 0;
  min-height: 0;
  /* Pane itself no longer scrolls; the inner .jr-tree-rows container does,
     so the breadcrumb bar above stays pinned. */
  overflow: hidden;
  border-right: 1px solid var(--jr-border);
  display: flex;
  flex-direction: column;
  /* Selected row already has its own accent indicator, so no focus ring
     on the container itself. */
  outline: none;
}
.jr-tree-rows {
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* Flex-column so .jr-empty inside can stretch + center vertically. */
  display: flex;
  flex-direction: column;
}

/* Generation switcher — only rendered when >1 specs (e.g. AI chat with
   multiple assistant replies). Sits above the breadcrumbs. */
.jr-generations {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  min-height: 28px;
  border-bottom: 1px solid var(--jr-border);
  background: var(--jr-bg);
  font-family: var(--jr-font-mono);
  font-size: 11px;
}
.jr-generations:empty {
  display: none;
}
.jr-generation-select {
  background: var(--jr-bg-soft);
  color: var(--jr-fg);
  border: 1px solid var(--jr-border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  outline: none;
  cursor: pointer;
}
.jr-generation-select:focus-visible {
  border-color: var(--jr-accent);
}
.jr-generations-count {
  color: var(--jr-fg-dim);
  font-size: 10px;
}
.jr-breadcrumbs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  min-height: 28px;
  border-bottom: 1px solid var(--jr-border);
  background: var(--jr-bg);
  white-space: nowrap;
  font-family: var(--jr-font-mono);
  font-size: 11px;
}
.jr-breadcrumbs-trail {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.jr-breadcrumbs-tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 4px;
  border-left: 1px solid var(--jr-border);
  margin-left: 4px;
}
.jr-view-btn {
  width: 24px;
  height: 22px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--jr-fg-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.jr-view-btn:hover {
  color: var(--jr-fg);
  background: var(--jr-bg-muted);
}
.jr-view-btn[data-active="true"] {
  color: var(--jr-accent);
  background: var(--jr-bg-muted);
}
.jr-breadcrumb {
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--jr-fg-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  font: inherit;
  white-space: nowrap;
}
.jr-breadcrumb:hover {
  color: var(--jr-fg);
  background: var(--jr-bg-muted);
}
.jr-breadcrumb[data-current="true"] {
  color: var(--jr-accent);
  background: var(--jr-bg-muted);
}
.jr-breadcrumb-sep {
  color: var(--jr-fg-dim);
  font-size: 10px;
  padding: 0 1px;
  user-select: none;
}
.jr-breadcrumbs-empty {
  color: var(--jr-fg-dim);
  padding: 2px 6px;
  font-style: italic;
}

/* Raw JSON view — spec pretty-printed, selectable for copy/paste. */
.jr-raw {
  margin: 0;
  padding: 10px 12px;
  flex: 1;
  min-height: 0;
  font-family: var(--jr-font-mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--jr-fg);
  white-space: pre;
  overflow: auto;
  -moz-tab-size: 2;
  tab-size: 2;
}
.jr-split-right {
  width: 40%;
  min-width: 240px;
  max-width: 60%;
  min-height: 0;
  overflow: auto;
  background: var(--jr-bg);
  display: flex;
  flex-direction: column;
}

.jr-detail {
  padding: 10px 12px;
  font-family: var(--jr-font-mono);
  font-size: 11px;
  color: var(--jr-fg);
}
.jr-detail h4 {
  margin: 0 0 6px 0;
  font-family: var(--jr-font-mono);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--jr-fg-dim);
}
.jr-detail pre {
  margin: 0 0 14px 0;
  padding: 8px;
  background: var(--jr-bg-soft);
  border: 1px solid var(--jr-border);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--jr-fg);
}

/* --- State editor --- */
.jr-state-row {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px;
  padding: 3px 12px;
  border-bottom: 1px solid var(--jr-border);
  font-family: var(--jr-font-mono);
  font-size: 11px;
  align-items: center;
}
.jr-state-path {
  color: var(--jr-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jr-state-value {
  background: transparent;
  color: var(--jr-fg);
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 2px 4px;
  font-family: var(--jr-font-mono);
  font-size: 11px;
  outline: none;
  width: 100%;
  min-width: 0;
}
.jr-state-value:hover {
  border-color: var(--jr-border);
}
.jr-state-value:focus {
  border-color: var(--jr-accent);
  background: var(--jr-bg-soft);
}
.jr-state-value[data-dirty="true"] {
  border-color: var(--jr-amber);
}

/* --- Catalog chips --- */
.jr-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.jr-chip {
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--jr-font-mono);
  font-size: 10px;
  background: var(--jr-bg-soft);
  color: var(--jr-fg-muted);
  border: 1px solid var(--jr-border);
}
.jr-chip[data-tone="prop"] { color: var(--jr-green); border-color: rgba(74, 222, 128, 0.25); }
.jr-chip[data-tone="event"] { color: var(--jr-accent); border-color: rgba(96, 165, 250, 0.25); }
.jr-chip[data-tone="param"] { color: var(--jr-amber); border-color: rgba(251, 191, 36, 0.25); }

.jr-catalog-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--jr-border);
}
.jr-catalog-name {
  font-family: var(--jr-font-mono);
  font-size: 11px;
  color: var(--jr-fg);
  font-weight: 600;
}
.jr-catalog-desc {
  font-size: 11px;
  color: var(--jr-fg-muted);
  margin-top: 2px;
}
`;

/**
 * CSS injected into the *host* document (not the shadow root). It supports:
 *
 * 1. The picker overlay — paints an outline + label on whichever element the
 *    user is hovering while the picker is active.
 * 2. Reserved-space layout — when \`reserveSpace\` is enabled the panel writes
 *    its size to \`--jr-devtools-offset-bottom\` / \`--jr-devtools-offset-right\`
 *    on \`:root\` and we apply matching \`padding-bottom\` / \`padding-right\` to
 *    \`body\`, so non-fixed content scrolls into view rather than being hidden.
 *    \`--jr-devtools-offset\` is kept as an alias for whichever edge is
 *    currently active (back-compat).
 *
 * Apps with \`position: fixed\` / \`position: sticky\` / \`100vh\` layouts can
 * opt in per element:
 *
 * \`\`\`css
 * .composer { bottom: var(--jr-devtools-offset-bottom, 0); }
 * .sidebar  { right:  var(--jr-devtools-offset-right,  0); }
 * .app      { height: calc(100vh - var(--jr-devtools-offset-bottom, 0)); }
 * \`\`\`
 */
export const HOST_CSS = `
:root {
  --jr-devtools-offset-bottom: 0px;
  --jr-devtools-offset-right: 0px;
}

html[data-jr-devtools-reserve="true"] body {
  box-sizing: border-box;
  padding-bottom: var(--jr-devtools-offset-bottom, 0);
  padding-right: var(--jr-devtools-offset-right, 0);
  transition: padding-bottom 0.12s ease-out, padding-right 0.12s ease-out;
}

html[data-jr-devtools-picking="true"],
html[data-jr-devtools-picking="true"] * {
  cursor: crosshair !important;
}

/* Floating overlays + labels used by two features:
   1. Picker — while the toolbar button is active and the user hovers the page
   2. Tree hover — while the user hovers a row in the Spec tab tree
   Both use the same visual language. Not rendered with a CSS \`outline\` on the
   target because the json-render element wrappers use \`display: contents\`
   (no box, no outline). */
#__jr_devtools_picker_overlay,
#__jr_devtools_hover_overlay {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  background: rgba(96, 165, 250, 0.15);
  outline: 2px solid #60a5fa;
  outline-offset: 0;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(9, 9, 11, 0.4);
  display: none;
}
#__jr_devtools_picker_label,
#__jr_devtools_hover_label {
  position: fixed;
  z-index: 2147483646;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 4px;
  background: #60a5fa;
  color: #09090b;
  pointer-events: none;
  white-space: nowrap;
  display: none;
}
/* Secondary overlays painted for the *other* instances of a repeated spec
   element — amber + dashed so they read as "siblings of the hovered one". */
.__jr_devtools_hover_extra {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  background: rgba(251, 191, 36, 0.08);
  outline: 2px dashed #fbbf24;
  outline-offset: 0;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(9, 9, 11, 0.4);
  display: none;
}
`;
