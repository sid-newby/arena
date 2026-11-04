/**
 * Tiny hyperscript-style helper for building DOM nodes without JSX.
 *
 * Keeps the vanilla-TS panel readable. Supports attributes starting with
 * `on` as event listeners, `className`, inline `style` objects, and a mix
 * of string / node / array children.
 */

type Child = Node | string | number | null | undefined | false | Child[];

type Attrs = {
  [key: string]: unknown;
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
};

function appendChild(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "className") {
        el.className = String(value);
      } else if (key === "style" && typeof value === "object") {
        Object.assign(el.style, value as Partial<CSSStyleDeclaration>);
      } else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "dataset" && typeof value === "object") {
        for (const [dk, dv] of Object.entries(
          value as Record<string, string>,
        )) {
          el.dataset[dk] = String(dv);
        }
      } else if (typeof value === "boolean") {
        if (value) el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) appendChild(el, child);
  return el;
}

/** Replace the children of `parent` with `next`, clearing first. */
export function replaceChildren(parent: Node, ...next: Child[]): void {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  for (const n of next) appendChild(parent, n);
}

/** Render a short JSON preview that truncates long values. */
export function jsonPreview(value: unknown, max = 140): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) return "undefined";
  if (text.length > max) return text.slice(0, max - 1) + "\u2026";
  return text;
}

/** Format an absolute timestamp (ms) as `HH:MM:SS.mmm`. */
export function formatTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}
