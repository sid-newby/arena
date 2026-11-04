import type { Catalog, Spec, StateStore } from "@json-render/core";
import type { EventStore } from "../event-store";
import type { PickerOptions, PickerSession } from "../types";

/**
 * Where the devtools panel docks and where the floating toggle lives.
 *
 * - `bottom-right` (default) — panel docks to the bottom; toggle sits in the
 *   bottom-right corner.
 * - `bottom-left` — panel docks to the bottom; toggle sits in the bottom-left
 *   corner. Useful when the host app already has something bottom-right.
 * - `right` — panel docks to the right edge (full height); toggle sits in the
 *   top-right corner. Best for app-shell layouts that already use `100vh` /
 *   `position: fixed` at the bottom — right docking avoids the bottom edge
 *   entirely.
 */
export type PanelPosition = "bottom-right" | "bottom-left" | "right";

/** @internal Normalized dock edge derived from {@link PanelPosition}. */
export type PanelDock = "bottom" | "right";

/**
 * A single spec available for inspection. When the host app renders one
 * spec at a time (the common single-renderer case) this list has a single
 * entry. Multi-renderer hosts (e.g. an AI chat where each assistant reply
 * produces its own spec) surface every generation so the Spec tab can
 * switch between them.
 */
export interface SpecEntry {
  /** Stable id, typically the message id that produced the spec. */
  id: string;
  /** Human-readable label shown in the generation switcher (e.g. "Generation 2"). */
  label: string;
  /** The spec itself. */
  spec: Spec;
}

/**
 * Context shared with every tab. Tabs read live values via getters so they
 * always see the latest spec/state/catalog without needing to re-mount.
 */
export interface PanelContext {
  /** Event log shared by all panels. */
  events: EventStore;
  /** Returns the current (usually latest) spec or `null`. */
  getSpec: () => Spec | null;
  /**
   * Optional: returns every inspectable spec on the page.
   * Hosts with multiple concurrent renderers (e.g. a chat with one spec
   * per assistant message) provide this so the Spec tab can offer a
   * generation switcher. When absent, the tab falls back to `getSpec()`
   * alone.
   */
  getSpecs?: () => SpecEntry[];
  /** Returns the current catalog or `null`. */
  getCatalog: () => Catalog | null;
  /** Returns the live `StateStore` or `null` (only set when a provider is mounted). */
  getStateStore: () => StateStore | null;
  /** Start a picker session. Returns `null` if no DOM is available. */
  startPicker?: (options: PickerOptions) => PickerSession | null;
  /** Selection channel shared across tabs (picker <-> Spec tab). */
  selection: SelectionBus;
  /** Activate a specific tab by id. */
  activateTab: (id: string) => void;
}

/**
 * Bus for syncing the currently focused spec element key across tabs and the
 * picker overlay. Tabs read the current value and subscribe to changes;
 * anything that wants to focus an element (picker, tree click) calls `set`.
 */
export interface SelectionBus {
  get: () => string | null;
  set: (key: string | null) => void;
  subscribe: (listener: (key: string | null) => void) => () => void;
}

/** Create an in-memory {@link SelectionBus}. */
export function createSelectionBus(): SelectionBus {
  let value: string | null = null;
  const listeners = new Set<(key: string | null) => void>();
  return {
    get: () => value,
    set(next) {
      if (value === next) return;
      value = next;
      for (const l of listeners) l(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * A tab registered with the panel. Tabs are rendered lazily — `mount` is
 * called the first time the tab is activated, and `update` is called on
 * every re-render request after that.
 */
export interface TabDef {
  /** Stable tab id used in URL hash / storage. */
  id: string;
  /** Short label shown in the tab strip. */
  label: string;
  /** Optional count badge, recomputed on every render. */
  badge?: (ctx: PanelContext) => number | string | undefined;
  /** Create the DOM for this tab. Called once per activation. */
  mount: (root: HTMLElement, ctx: PanelContext) => TabInstance;
}

/**
 * A live tab. `update` is called whenever an event fires or the host
 * refreshes; `destroy` is called when the tab is unmounted.
 */
export interface TabInstance {
  /** Re-render with latest data. */
  update: () => void;
  /** Clean up subscriptions / listeners. */
  destroy?: () => void;
}

/**
 * Options for {@link createPanel}.
 */
export interface PanelOptions {
  /** Shared panel context. */
  context: PanelContext;
  /** Tabs to register. Order is preserved in the tab strip. */
  tabs: TabDef[];
  /** Host-document node to mount under. Default: `document.body`. */
  host?: HTMLElement;
  /** Position of the floating toggle button. */
  position?: PanelPosition;
  /** Start open. Default: `false`. */
  initialOpen?: boolean;
  /**
   * Keyboard shortcut to toggle the panel, or `false` to disable.
   * Syntax: `"mod+shift+j"` (`mod` = meta on mac, ctrl elsewhere).
   * Default: `"mod+shift+j"`.
   */
  hotkey?: string | false;
  /**
   * Whether the panel should push the host app's content out of the way
   * while open, by applying `padding` on `<body>` matching the panel's size.
   *
   * - `true` (default) — body padding is applied. Works for document-flow
   *   layouts and `height: 100%` app shells. Modern apps that use
   *   `height: 100vh`, `position: fixed; bottom: 0` etc. are effectively
   *   *overlaid* by the panel because CSS can't resize `100vh`. Pair this
   *   with `"right"` docking or opt those specific elements in via
   *   `bottom: var(--jr-devtools-offset-bottom, 0)` /
   *   `right: var(--jr-devtools-offset-right, 0)`.
   * - `false` — the panel is a pure overlay. Nothing is pushed; the host
   *   app remains visually unchanged. The CSS custom properties
   *   `--jr-devtools-offset-bottom` / `--jr-devtools-offset-right` are
   *   still published on `:root` so apps can reserve their own space.
   */
  reserveSpace?: boolean;
  /**
   * When `true` (default), show a toolbar button that lets the user flip
   * the panel between bottom-dock and right-dock. The user's choice
   * persists across reloads (localStorage key `__jr_devtools_dock`), and
   * takes precedence over the initial `position` once set.
   *
   * When `false`, the dock follows `position` exactly and the toolbar
   * button is not rendered — useful when the host app's layout only works
   * with one dock.
   */
  allowDockToggle?: boolean;
}

/**
 * Returned from {@link createPanel}. Controls the panel lifecycle.
 */
export interface PanelHandle {
  /** Show the panel. */
  open: () => void;
  /** Hide the panel. */
  close: () => void;
  /** Toggle open/closed. */
  toggle: () => void;
  /** True if the panel is currently open. */
  isOpen: () => boolean;
  /** Request that all visible tabs re-render. */
  refresh: () => void;
  /** Remove the panel from the DOM and clean up. */
  destroy: () => void;
}
