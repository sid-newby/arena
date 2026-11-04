import { h, replaceChildren } from "./dom";
import { setHoverHighlight } from "../picker";
import { HOST_CSS, PANEL_CSS } from "./styles";
import type {
  PanelContext,
  PanelDock,
  PanelHandle,
  PanelOptions,
  PanelPosition,
  TabDef,
  TabInstance,
} from "./types";

const HOST_ATTR = "data-jr-devtools-host";
const HOST_STYLE_ID = "__jr_devtools_host_styles";
const RESERVE_ATTR = "data-jr-devtools-reserve";
const OFFSET_VAR_BOTTOM = "--jr-devtools-offset-bottom";
const OFFSET_VAR_RIGHT = "--jr-devtools-offset-right";
/** Back-compat alias: points at whichever edge is currently active. */
const OFFSET_VAR_ALIAS = "--jr-devtools-offset";

function ensureHostStyles() {
  if (document.getElementById(HOST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HOST_STYLE_ID;
  style.textContent = HOST_CSS;
  document.head.appendChild(style);
}

/**
 * Publish the panel's current size on `:root` as two CSS custom properties:
 * `--jr-devtools-offset-bottom` and `--jr-devtools-offset-right`. Only the
 * one matching the active dock is non-zero at a time. `--jr-devtools-offset`
 * is maintained as an alias for whichever edge is currently active, so older
 * app CSS keeps working.
 */
function setOffset(dock: PanelDock, px: number) {
  const root = document.documentElement;
  const bottom = dock === "bottom" ? px : 0;
  const right = dock === "right" ? px : 0;
  if (bottom > 0) root.style.setProperty(OFFSET_VAR_BOTTOM, `${bottom}px`);
  else root.style.removeProperty(OFFSET_VAR_BOTTOM);
  if (right > 0) root.style.setProperty(OFFSET_VAR_RIGHT, `${right}px`);
  else root.style.removeProperty(OFFSET_VAR_RIGHT);
  if (px > 0) root.style.setProperty(OFFSET_VAR_ALIAS, `${px}px`);
  else root.style.removeProperty(OFFSET_VAR_ALIAS);
}

/** Map toggle-button position to the panel dock edge. */
function dockFromPosition(position: PanelPosition): PanelDock {
  return position === "right" ? "right" : "bottom";
}

const STORAGE_DOCK = "__jr_devtools_dock";
const STORAGE_HEIGHT = "__jr_devtools_height";
const STORAGE_WIDTH = "__jr_devtools_width";

function readStoredDock(): PanelDock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_DOCK);
    return raw === "bottom" || raw === "right" ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredDock(dock: PanelDock): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_DOCK, dock);
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}

/** Per-dock layout constants (storage key, default/min size, CSS var). */
function dockSpec(dock: PanelDock) {
  return dock === "right"
    ? {
        key: STORAGE_WIDTH,
        defaultSize: 440,
        minSize: 260,
        cssVar: "--jr-panel-width" as const,
      }
    : {
        key: STORAGE_HEIGHT,
        defaultSize: 380,
        minSize: 180,
        cssVar: "--jr-panel-height" as const,
      };
}

/** Inline SVG used for the Pick toolbar button (lucide square-mouse-pointer). */
const PICK_ICON_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.944l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.944.033z"/>
  <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/>
</svg>`;

/**
 * Pixel-style `{}` mark for the floating toggle. Drawn as a 14×14 grid of
 * 2px rects so it's perfectly symmetric on both axes — eliminates the
 * font-glyph-off-centre issue we'd get by rendering live text.
 */
const TOGGLE_BRACES_SVG = `
<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
  <rect x="2" y="0" width="4" height="2"/>
  <rect x="2" y="2" width="2" height="4"/>
  <rect x="0" y="6" width="2" height="2"/>
  <rect x="2" y="8" width="2" height="4"/>
  <rect x="2" y="12" width="4" height="2"/>
  <rect x="8" y="0" width="4" height="2"/>
  <rect x="10" y="2" width="2" height="4"/>
  <rect x="12" y="6" width="2" height="2"/>
  <rect x="10" y="8" width="2" height="4"/>
  <rect x="8" y="12" width="4" height="2"/>
</svg>`;

/** Inline SVGs for the dock-toggle button (lucide panel-bottom / panel-right). */
const PANEL_BOTTOM_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect width="18" height="18" x="3" y="3" rx="2"/>
  <path d="M3 15h18"/>
</svg>`;
const PANEL_RIGHT_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect width="18" height="18" x="3" y="3" rx="2"/>
  <path d="M15 3v18"/>
</svg>`;

function matchHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const isMac =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  let needsMod = false;
  let needsShift = false;
  let needsAlt = false;
  let key = "";
  for (const p of parts) {
    if (p === "mod") needsMod = true;
    else if (p === "ctrl") needsMod = true;
    else if (p === "meta" || p === "cmd") needsMod = true;
    else if (p === "shift") needsShift = true;
    else if (p === "alt" || p === "option") needsAlt = true;
    else key = p;
  }
  const modOk = needsMod ? (isMac ? event.metaKey : event.ctrlKey) : true;
  const shiftOk = needsShift ? event.shiftKey : true;
  const altOk = needsAlt ? event.altKey : true;
  const keyOk = key ? event.key.toLowerCase() === key : true;
  return modOk && shiftOk && altOk && keyOk;
}

/**
 * Create a devtools panel and mount it to the host document.
 *
 * Idempotent per-host: if a panel is already mounted under the given host,
 * this returns that panel's handle instead of creating a duplicate.
 */
export function createPanel(options: PanelOptions): PanelHandle {
  const host =
    options.host ?? (typeof document !== "undefined" ? document.body : null);
  if (!host) {
    return {
      open() {},
      close() {},
      toggle() {},
      isOpen: () => false,
      refresh() {},
      destroy() {},
    };
  }

  // If a panel root already exists, reuse its handle.
  const existing = host.querySelector(`[${HOST_ATTR}]`);
  if (
    existing &&
    (existing as HTMLElement & { __jrHandle?: PanelHandle }).__jrHandle
  ) {
    return (existing as HTMLElement & { __jrHandle: PanelHandle }).__jrHandle;
  }

  ensureHostStyles();

  const rootHost = document.createElement("div");
  rootHost.setAttribute(HOST_ATTR, "");
  host.appendChild(rootHost);

  const shadow = rootHost.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = PANEL_CSS;
  shadow.appendChild(styleEl);

  const position: PanelPosition = options.position ?? "bottom-right";
  const allowDockToggle = options.allowDockToggle ?? true;
  // Initial dock: stored user preference wins (when the user is allowed to
  // toggle), otherwise fall back to whatever `position` implies.
  const initialDock: PanelDock =
    (allowDockToggle ? readStoredDock() : null) ?? dockFromPosition(position);
  let dock: PanelDock = initialDock;
  const reserveSpace = options.reserveSpace ?? true;
  // Opt the host document in to reserved-space padding (HOST_CSS is scoped
  // by this attribute so apps that pass `reserveSpace: false` are untouched).
  if (reserveSpace) {
    document.documentElement.setAttribute(RESERVE_ATTR, "true");
  }
  let open = options.initialOpen ?? false;
  let activeTabId = options.tabs[0]?.id ?? "";

  const ctx: PanelContext = options.context;
  const tabs = options.tabs;
  const tabInstances = new Map<string, TabInstance>();

  // --- Toggle button ---
  const toggleBtn = h("button", {
    className: "jr-toggle",
    "data-position": position,
    "data-open": String(open),
    title: "json-render devtools",
    "aria-label": "Toggle json-render devtools",
    onClick: () => toggle(),
  });
  toggleBtn.innerHTML = TOGGLE_BRACES_SVG;
  shadow.appendChild(toggleBtn);

  // --- Panel container ---
  const tabsStrip = h("div", { className: "jr-tabs" });
  const body = h("div", { className: "jr-body" });

  // Pick button lives in the header toolbar (Chrome DevTools style) so it is
  // reachable from any tab without stealing a tab slot.
  const pickBtn = h("button", {
    className: "jr-icon-btn jr-pick-btn",
    title: "Select an element in the page (Esc to cancel)",
    "aria-label": "Select an element in the page",
    onClick: () => togglePicker(),
  });
  pickBtn.innerHTML = PICK_ICON_SVG;

  // Dock-toggle button (only visible when `allowDockToggle` is enabled).
  // Shows the *target* dock icon — click it to move the panel there.
  const dockBtn = h("button", {
    className: "jr-icon-btn jr-dock-btn",
    "aria-label": "Toggle devtools dock",
    onClick: () => toggleDock(),
  });
  function updateDockButton() {
    if (dock === "bottom") {
      dockBtn.innerHTML = PANEL_RIGHT_SVG;
      dockBtn.title = "Dock to right";
    } else {
      dockBtn.innerHTML = PANEL_BOTTOM_SVG;
      dockBtn.title = "Dock to bottom";
    }
  }
  updateDockButton();

  const closeBtn = h(
    "button",
    {
      className: "jr-icon-btn",
      title: "Close devtools",
      "aria-label": "Close",
      onClick: () => close(),
    },
    "\u00d7",
  );

  const header = h(
    "header",
    { className: "jr-header" },
    h("div", { className: "jr-title" }, "json-render devtools"),
    tabsStrip,
    h(
      "div",
      { className: "jr-actions" },
      pickBtn,
      allowDockToggle ? dockBtn : null,
      closeBtn,
    ),
  );

  const resizeHandle = h("div", {
    className: "jr-resize",
    "aria-label": "Resize devtools",
  });

  const panel = h(
    "section",
    {
      className: "jr-panel",
      "data-hidden": String(!open),
      "data-dock": dock,
      role: "complementary",
    },
    resizeHandle,
    header,
    body,
  );
  shadow.appendChild(panel);

  // --- Resize handling ---
  // Bottom-docked panels resize vertically; right-docked panels resize
  // horizontally. Each dock has its own localStorage key so switching
  // docks doesn't inherit the wrong dimension.
  let panelSize = loadSizeFor(dock);
  applyPanelSize(dock, panelSize);

  function loadSizeFor(d: PanelDock): number {
    const spec = dockSpec(d);
    const stored =
      typeof window !== "undefined"
        ? window.localStorage?.getItem(spec.key)
        : null;
    let size = stored ? parseInt(stored, 10) : spec.defaultSize;
    if (!Number.isFinite(size) || size < spec.minSize) {
      size = spec.defaultSize;
    }
    return size;
  }

  function applyPanelSize(d: PanelDock, size: number): void {
    const spec = dockSpec(d);
    // Clear the opposite axis's CSS var so old values don't linger.
    const other = d === "bottom" ? "--jr-panel-width" : "--jr-panel-height";
    panel.style.removeProperty(other);
    panel.style.setProperty(spec.cssVar, `${size}px`);
  }

  resizeHandle.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    const d = dock;
    const startCoord = d === "right" ? ev.clientX : ev.clientY;
    const startSize = panelSize;
    const spec = dockSpec(d);
    const onMove = (e: MouseEvent) => {
      // Both axes: dragging *away* from the dock edge (up for bottom, left
      // for right) grows the panel.
      const current = d === "right" ? e.clientX : e.clientY;
      const delta = startCoord - current;
      const viewport = d === "right" ? window.innerWidth : window.innerHeight;
      panelSize = Math.max(
        spec.minSize,
        Math.min(viewport * 0.9, startSize + delta),
      );
      applyPanelSize(d, panelSize);
      if (open && reserveSpace) setOffset(d, panelSize);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try {
        window.localStorage?.setItem(spec.key, String(panelSize));
      } catch {
        // ignore storage errors (private mode, etc.)
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // --- Dock toggle ---
  function setDock(next: PanelDock, persist: boolean) {
    if (next === dock) return;
    // Clear the old axis's offset before switching so the host body
    // padding doesn't flash the wrong value during the transition.
    setOffset(dock, 0);
    dock = next;
    panel.dataset.dock = next;
    panelSize = loadSizeFor(next);
    applyPanelSize(next, panelSize);
    if (open && reserveSpace) setOffset(next, panelSize);
    if (persist) writeStoredDock(next);
    updateDockButton();
  }

  function toggleDock() {
    if (!allowDockToggle) return;
    setDock(dock === "bottom" ? "right" : "bottom", true);
  }

  // --- Picker (toolbar button) ---
  let pickerStop: (() => void) | null = null;

  function updatePickButton() {
    const active = !!pickerStop;
    pickBtn.dataset.active = String(active);
    pickBtn.title = active
      ? "Stop picking (Esc)"
      : "Select an element in the page";
    pickBtn.disabled = typeof document === "undefined" || !ctx.startPicker;
  }

  function stopPicker() {
    if (pickerStop) pickerStop();
    pickerStop = null;
    updatePickButton();
  }

  function startPickerSession() {
    if (pickerStop || !ctx.startPicker) return;
    const session = ctx.startPicker({
      onPick: (key) => {
        pickerStop = null;
        updatePickButton();
        ctx.selection.set(key);
        // Jump to the Spec tab if one is registered so the user sees the
        // matching element right after picking.
        if (tabs.some((t) => t.id === "spec")) {
          ctx.activateTab("spec");
        } else {
          openPanel();
        }
      },
      onCancel: () => {
        pickerStop = null;
        updatePickButton();
      },
    });
    if (!session) return;
    pickerStop = session.stop;
    updatePickButton();
  }

  function togglePicker() {
    if (pickerStop) stopPicker();
    else startPickerSession();
  }

  updatePickButton();

  // --- Tab strip ---
  const tabButtons = new Map<string, HTMLButtonElement>();

  function renderTabs() {
    replaceChildren(
      tabsStrip,
      tabs.map((tab) => {
        const badgeValue = tab.badge?.(ctx);
        const btn = h(
          "button",
          {
            className: "jr-tab",
            "data-active": String(tab.id === activeTabId),
            "data-tab": tab.id,
            onClick: () => setActiveTab(tab.id),
          },
          tab.label,
          badgeValue !== undefined && badgeValue !== "" && badgeValue !== 0
            ? h("span", { className: "jr-tab-count" }, String(badgeValue))
            : null,
        );
        tabButtons.set(tab.id, btn);
        return btn;
      }),
    );
  }

  function activateTab(id: string) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    body.textContent = "";
    const panelEl = h("div", { className: "jr-tab-panel", "data-tab": id });
    body.appendChild(panelEl);
    // Destroy previous tab instances (single active tab at a time)
    for (const [prevId, inst] of tabInstances) {
      if (prevId !== id) {
        try {
          inst.destroy?.();
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[json-render devtools] tab destroy threw:", err);
          }
        }
        tabInstances.delete(prevId);
      }
    }
    const instance = tab.mount(panelEl, ctx);
    tabInstances.set(id, instance);
  }

  function setActiveTab(id: string) {
    if (activeTabId === id) return;
    activeTabId = id;
    renderTabs();
    activateTab(id);
  }

  // Let tabs (and the picker) jump to other tabs programmatically.
  ctx.activateTab = (id: string) => {
    setActiveTab(id);
    openPanel();
  };

  renderTabs();
  if (activeTabId) activateTab(activeTabId);

  // --- Global refresh on every event ---
  let scheduled = false;
  const runRefresh = () => {
    scheduled = false;
    renderTabs();
    const inst = tabInstances.get(activeTabId);
    inst?.update();
  };
  const scheduleRefresh = () => {
    if (scheduled) return;
    scheduled = true;
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(runRefresh);
    } else {
      setTimeout(runRefresh, 16);
    }
  };
  const unsubEvents = ctx.events.subscribe(scheduleRefresh);

  // --- Hotkey ---
  const hotkey = options.hotkey === undefined ? "mod+shift+j" : options.hotkey;
  const onKey = hotkey
    ? (e: KeyboardEvent) => {
        if (matchHotkey(e, hotkey)) {
          e.preventDefault();
          toggle();
        }
      }
    : null;
  if (onKey) document.addEventListener("keydown", onKey);

  // --- Lifecycle ---
  function setOpen(next: boolean) {
    open = next;
    toggleBtn.dataset.open = String(open);
    panel.dataset.hidden = String(!open);
    // Even when `reserveSpace` is false we still publish the CSS var so apps
    // that opt in (e.g. `bottom: var(--jr-devtools-offset-bottom, 0)`) get
    // the right value. HOST_CSS only applies body padding when the host
    // document has `data-jr-devtools-reserve="true"`.
    setOffset(dock, open ? panelSize : 0);
    if (open) {
      const inst = tabInstances.get(activeTabId);
      inst?.update();
    } else {
      // Closing cancels any in-flight picker so the hover outline doesn't
      // linger in the page. Clear the spec-tree hover highlight too — if
      // the user closed via hotkey they never moved the mouse off the row.
      stopPicker();
      setHoverHighlight(null);
    }
  }
  function openPanel() {
    setOpen(true);
  }
  function close() {
    setOpen(false);
  }
  function toggle() {
    setOpen(!open);
  }

  // Seed offset on mount so the toggle button doesn't sit over the app when
  // the panel is already open at boot.
  setOffset(dock, open ? panelSize : 0);

  const handle: PanelHandle = {
    open: openPanel,
    close,
    toggle,
    isOpen: () => open,
    refresh: scheduleRefresh,
    destroy() {
      unsubEvents();
      if (onKey) document.removeEventListener("keydown", onKey);
      stopPicker();
      setHoverHighlight(null);
      setOffset(dock, 0);
      for (const inst of tabInstances.values()) {
        try {
          inst.destroy?.();
        } catch {
          // ignore
        }
      }
      tabInstances.clear();
      rootHost.remove();
      // Only clear the reserve-space attribute once every panel is gone — in
      // rare HMR / multi-mount scenarios another panel may still be live.
      if (!document.querySelector(`[${HOST_ATTR}]`)) {
        document.documentElement.removeAttribute(RESERVE_ATTR);
      }
    },
  };

  (rootHost as HTMLElement & { __jrHandle?: PanelHandle }).__jrHandle = handle;
  return handle;
}

/**
 * Mount a panel with a minimal placeholder for each tab. Useful for tests
 * or environments where individual tab implementations aren't available.
 *
 * In production, consumers use {@link createPanel} with the full tab set.
 */
export function createStubTab(id: string, label: string): TabDef {
  return {
    id,
    label,
    mount(root) {
      const empty = h("div", { className: "jr-empty" }, `${label} (stub)`);
      root.appendChild(empty);
      return { update() {} };
    },
  };
}
