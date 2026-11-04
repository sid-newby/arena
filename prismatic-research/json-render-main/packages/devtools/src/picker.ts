import type { PickerOptions, PickerSession } from "./types";

/**
 * Attribute the ElementRenderer (when devtools is active) sets on each
 * rendered element's wrapper. The picker walks up from the hovered node
 * to the nearest ancestor bearing this attribute.
 */
export const DEVTOOLS_KEY_ATTR = "data-jr-key";

const PICKER_OVERLAY_ID = "__jr_devtools_picker_overlay";
const PICKER_LABEL_ID = "__jr_devtools_picker_label";
const HOVER_OVERLAY_ID = "__jr_devtools_hover_overlay";
const HOVER_LABEL_ID = "__jr_devtools_hover_label";

// ---------------------------------------------------------------------------
// Shared geometry helper
// ---------------------------------------------------------------------------

/**
 * Compute a bounding rect for a (possibly `display: contents`) element by
 * falling back to the union of its descendants' client rects.
 *
 * json-render wraps every keyed element in `<span data-jr-key="..." style
 * ="display:contents">`, and `display: contents` elements don't generate a
 * CSS box — so their own `getBoundingClientRect()` returns `0 × 0` and a
 * plain CSS outline paints nothing. We recursively widen to child boxes so
 * the overlay tracks the visible extent.
 */
function computeBounds(el: Element): DOMRect | null {
  const own = el.getBoundingClientRect();
  if (own.width > 0 && own.height > 0) return own;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as Element | null;
  while (node) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      if (r.left < left) left = r.left;
      if (r.top < top) top = r.top;
      if (r.right > right) right = r.right;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    node = walker.nextNode() as Element | null;
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Position an overlay + label pair over a given rect. Both elements are
 * created on demand inside `document.body`; callers pass in the ids so the
 * picker and the tree-hover highlight don't collide.
 */
function paintOverlay(
  rect: DOMRect,
  label: string,
  ids: { overlay: string; label: string },
): { overlay: HTMLDivElement; label: HTMLDivElement } {
  let ov = document.getElementById(ids.overlay) as HTMLDivElement | null;
  if (!ov) {
    ov = document.createElement("div");
    ov.id = ids.overlay;
    document.body.appendChild(ov);
  }
  ov.style.display = "block";
  ov.style.left = `${rect.left}px`;
  ov.style.top = `${rect.top}px`;
  ov.style.width = `${rect.width}px`;
  ov.style.height = `${rect.height}px`;

  let lb = document.getElementById(ids.label) as HTMLDivElement | null;
  if (!lb) {
    lb = document.createElement("div");
    lb.id = ids.label;
    document.body.appendChild(lb);
  }
  lb.textContent = label;
  lb.style.display = "block";
  const labelLeft = Math.max(4, rect.left);
  // Prefer the label above the overlay, fall back to below when the element
  // is flush against the viewport top.
  const labelTop = rect.top >= 24 ? rect.top - 22 : rect.top + rect.height + 4;
  lb.style.left = `${labelLeft}px`;
  lb.style.top = `${labelTop}px`;
  return { overlay: ov, label: lb };
}

function hideOverlayPair(ids: { overlay: string; label: string }): void {
  const ov = document.getElementById(ids.overlay);
  const lb = document.getElementById(ids.label);
  if (ov) ov.style.display = "none";
  if (lb) lb.style.display = "none";
}

function removeOverlayPair(ids: { overlay: string; label: string }): void {
  const ov = document.getElementById(ids.overlay);
  const lb = document.getElementById(ids.label);
  if (ov) ov.remove();
  if (lb) lb.remove();
}

// ---------------------------------------------------------------------------
// Picker — click-to-pick session started by the toolbar button
// ---------------------------------------------------------------------------

/**
 * Start an interactive DOM picker. The user hovers or clicks any element
 * in the page; when a click lands on (or inside) a node carrying
 * {@link DEVTOOLS_KEY_ATTR}, `onPick` fires with that key.
 *
 * Returns `null` in environments without a DOM (SSR, tests).
 *
 * The picker paints a translucent overlay + border over the hovered
 * element (Chrome-DevTools style). See {@link computeBounds} for the
 * `display: contents` fallback.
 */
export function startPicker(options: PickerOptions): PickerSession | null {
  if (typeof document === "undefined") return null;

  const IDS = { overlay: PICKER_OVERLAY_ID, label: PICKER_LABEL_ID };
  let currentHover: Element | null = null;

  function paint(el: Element) {
    const rect = computeBounds(el);
    if (!rect) {
      hideOverlayPair(IDS);
      return;
    }
    const key = el.getAttribute(DEVTOOLS_KEY_ATTR) ?? "";
    paintOverlay(
      rect,
      `${key}  ${Math.round(rect.width)} × ${Math.round(rect.height)}`,
      IDS,
    );
  }

  const onMove = (ev: MouseEvent) => {
    const target = ev.target as Element | null;
    if (!target || !target.closest) return;
    const host = target.closest(`[${DEVTOOLS_KEY_ATTR}]`);
    if (host !== currentHover) currentHover = host;
    if (host) paint(host);
    else hideOverlayPair(IDS);
  };

  const onClick = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const target = ev.target as Element | null;
    const host = target?.closest?.(`[${DEVTOOLS_KEY_ATTR}]`);
    if (host) {
      const key = host.getAttribute(DEVTOOLS_KEY_ATTR) ?? "";
      stop();
      options.onPick(key);
    }
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      stop();
      options.onCancel?.();
    }
  };

  // Keep the overlay glued to the element while the user scrolls, the
  // viewport resizes, or the DOM reflows (e.g. streaming patches arrive
  // during pick).
  const onReposition = () => {
    if (currentHover && currentHover.isConnected) {
      paint(currentHover);
    } else if (currentHover) {
      currentHover = null;
      hideOverlayPair(IDS);
    }
  };

  function stop() {
    removeOverlayPair(IDS);
    currentHover = null;
    document.documentElement.removeAttribute("data-jr-devtools-picking");
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onReposition, true);
    window.removeEventListener("resize", onReposition);
  }

  document.documentElement.setAttribute("data-jr-devtools-picking", "true");
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onReposition, true);
  window.addEventListener("resize", onReposition);

  return { stop };
}

// ---------------------------------------------------------------------------
// Hover highlight — persistent overlay driven by spec-tree hover
// ---------------------------------------------------------------------------

const HOVER_IDS = { overlay: HOVER_OVERLAY_ID, label: HOVER_LABEL_ID };
/**
 * Class (not id) used for the *secondary* overlays that paint the extra
 * instances of a repeated element. Styled by HOST_CSS with a dashed amber
 * outline so they're clearly distinguished from the single primary hover.
 */
const HOVER_EXTRA_CLASS = "__jr_devtools_hover_extra";
let hoverKey: string | null = null;
let hoverListenersAttached = false;
let hoverExtraOverlays: HTMLDivElement[] = [];

function ensureExtraOverlay(index: number): HTMLDivElement {
  let ov = hoverExtraOverlays[index];
  if (!ov) {
    ov = document.createElement("div");
    ov.className = HOVER_EXTRA_CLASS;
    document.body.appendChild(ov);
    hoverExtraOverlays[index] = ov;
  }
  return ov;
}

function hideExtrasFrom(index: number): void {
  for (let i = index; i < hoverExtraOverlays.length; i++) {
    const ov = hoverExtraOverlays[i];
    if (ov) ov.style.display = "none";
  }
}

function removeAllExtras(): void {
  for (const ov of hoverExtraOverlays) ov.remove();
  hoverExtraOverlays = [];
}

function repositionHover() {
  if (!hoverKey) return;
  const matches = findAllElementsByKey(hoverKey);
  const first = matches[0];
  if (!first) {
    hideOverlayPair(HOVER_IDS);
    hideExtrasFrom(0);
    return;
  }

  // Primary overlay + label paints the first match.
  const firstRect = computeBounds(first);
  if (!firstRect) {
    hideOverlayPair(HOVER_IDS);
    hideExtrasFrom(0);
    return;
  }
  const labelSuffix =
    matches.length > 1 ? `  (${matches.length} instances)` : "";
  paintOverlay(
    firstRect,
    `${hoverKey}  ${Math.round(firstRect.width)} × ${Math.round(firstRect.height)}${labelSuffix}`,
    HOVER_IDS,
  );

  // Extra instances (for repeated elements) get their own overlays,
  // styled in amber to distinguish from the primary.
  for (let i = 1; i < matches.length; i++) {
    const el = matches[i];
    if (!el) continue;
    const rect = computeBounds(el);
    const ov = ensureExtraOverlay(i - 1);
    if (!rect) {
      ov.style.display = "none";
      continue;
    }
    ov.style.display = "block";
    ov.style.left = `${rect.left}px`;
    ov.style.top = `${rect.top}px`;
    ov.style.width = `${rect.width}px`;
    ov.style.height = `${rect.height}px`;
  }
  hideExtrasFrom(Math.max(0, matches.length - 1));
}

function attachHoverListeners() {
  if (hoverListenersAttached || typeof window === "undefined") return;
  hoverListenersAttached = true;
  window.addEventListener("scroll", repositionHover, true);
  window.addEventListener("resize", repositionHover);
}

function detachHoverListeners() {
  if (!hoverListenersAttached || typeof window === "undefined") return;
  hoverListenersAttached = false;
  window.removeEventListener("scroll", repositionHover, true);
  window.removeEventListener("resize", repositionHover);
}

/**
 * Show (or hide) a persistent bounding-box overlay over the element
 * identified by `key`. Pass `null` to clear the overlay.
 *
 * Unlike {@link highlightElement}, this does not fade out — callers are
 * expected to clear it explicitly (typically on `mouseleave`). Safe to
 * call repeatedly; each call cheaply repositions the single overlay.
 */
export function setHoverHighlight(key: string | null): void {
  if (typeof document === "undefined") return;
  if (!key) {
    hoverKey = null;
    removeOverlayPair(HOVER_IDS);
    removeAllExtras();
    detachHoverListeners();
    return;
  }
  hoverKey = key;
  repositionHover();
  attachHoverListeners();
}

// ---------------------------------------------------------------------------
// Element lookup + brief flash highlight
// ---------------------------------------------------------------------------

/**
 * Look up the DOM element carrying `data-jr-key={key}`. Returns `null`
 * when no match (spec exists but hasn't rendered, or the element is
 * currently hidden by a visibility condition).
 *
 * Note: when an element appears inside a `repeat`, each repetition
 * renders its own DOM instance with the same `data-jr-key`. Use
 * {@link findAllElementsByKey} if you need all of them.
 */
export function findElementByKey(key: string): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(`[${DEVTOOLS_KEY_ATTR}="${cssEscape(key)}"]`);
}

/**
 * Return every DOM element carrying `data-jr-key={key}`. Intended for
 * repeated spec elements (list items, grid cells…) where a single spec
 * key renders to N DOM instances.
 */
export function findAllElementsByKey(key: string): Element[] {
  if (typeof document === "undefined") return [];
  const selector = `[${DEVTOOLS_KEY_ATTR}="${cssEscape(key)}"]`;
  return Array.from(document.querySelectorAll(selector));
}

/**
 * Briefly paint an outline around the DOM element for `key`, so clicking
 * a spec-tree row in the panel flashes its position in the page.
 *
 * The target is often a `display: contents` wrapper, so we build the
 * overlay from `computeBounds` (descendants' client rects) instead of
 * using a CSS outline on the target directly.
 */
export function highlightElement(key: string, durationMs = 1200): void {
  if (typeof document === "undefined") return;
  const el = findElementByKey(key);
  if (!el) return;
  const rect = computeBounds(el);
  if (!rect) return;

  const overlay = document.createElement("div");
  overlay.className = "__jr_devtools_highlight";
  overlay.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
    pointer-events: none;
    z-index: 2147483645;
    transition: opacity 0.25s ease-out;
    opacity: 1;
  `;
  document.body.appendChild(overlay);
  setTimeout(
    () => {
      overlay.style.opacity = "0";
    },
    Math.max(0, durationMs - 250),
  );
  setTimeout(() => {
    overlay.remove();
  }, durationMs);
}

/** Minimal CSS.escape fallback for environments without it. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
