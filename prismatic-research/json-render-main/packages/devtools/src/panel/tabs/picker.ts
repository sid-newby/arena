import { h, replaceChildren } from "../dom";
import { findElementByKey } from "../../picker";
import type { PanelContext, TabDef, TabInstance } from "../types";

const TAB_ID = "pick";

/**
 * Picker tab — explains the DOM picker flow, starts / stops a picker
 * session, and shows the currently selected element key. Selecting a key
 * in the spec tab reflects here; selecting here (via click-to-pick)
 * jumps back to the spec tab.
 */
export function pickerTab(): TabDef {
  return {
    id: TAB_ID,
    label: "Pick",
    mount(root, ctx) {
      return mountPickerTab(root, ctx);
    },
  };
}

function mountPickerTab(root: HTMLElement, ctx: PanelContext): TabInstance {
  let active = false;
  let stopFn: (() => void) | null = null;

  const body = h("div", { style: { padding: "16px 12px" } });
  root.appendChild(body);

  const unsubSelection = ctx.selection.subscribe(() => render());

  function start() {
    if (active) return;
    const session = ctx.startPicker?.({
      onPick: (key) => {
        active = false;
        stopFn = null;
        ctx.selection.set(key);
        ctx.activateTab("spec");
      },
      onCancel: () => {
        active = false;
        stopFn = null;
        render();
      },
    });
    if (!session) {
      render();
      return;
    }
    stopFn = session.stop;
    active = true;
    render();
  }

  function stop() {
    if (stopFn) stopFn();
    stopFn = null;
    active = false;
    render();
  }

  function render() {
    const selected = ctx.selection.get();
    const canPick = typeof document !== "undefined";
    const selectedMounted = selected ? !!findElementByKey(selected) : false;

    replaceChildren(
      body,
      h(
        "div",
        { style: { marginBottom: "12px", color: "var(--jr-fg-muted)" } },
        "Click in the page to pick an element. Hovering paints an outline.",
      ),
      h(
        "button",
        {
          className: "jr-icon-btn",
          style: {
            padding: "6px 12px",
            width: "auto",
            border: "1px solid var(--jr-border)",
            borderRadius: "6px",
          },
          disabled: !canPick,
          "data-active": String(active),
          onClick: () => (active ? stop() : start()),
        },
        active ? "Stop picking (Esc)" : "Start picking",
      ),
      h(
        "div",
        { style: { marginTop: "18px" } },
        h(
          "h4",
          {
            style: {
              margin: "0 0 6px 0",
              fontSize: "10px",
              color: "var(--jr-fg-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            },
          },
          "Current selection",
        ),
        selected
          ? h(
              "div",
              {
                className: "jr-badge",
                style: { padding: "4px 8px", fontSize: "11px" },
              },
              `#${selected}`,
            )
          : h(
              "div",
              { style: { color: "var(--jr-fg-dim)", fontSize: "11px" } },
              "No selection",
            ),
        selected && !selectedMounted
          ? h(
              "div",
              {
                style: {
                  marginTop: "6px",
                  color: "var(--jr-amber)",
                  fontSize: "10px",
                },
              },
              "This element has no DOM node right now (hidden by visibility, or renderer not wrapping for picker).",
            )
          : null,
      ),
      !canPick
        ? h(
            "div",
            {
              style: {
                marginTop: "18px",
                color: "var(--jr-fg-dim)",
                fontSize: "11px",
              },
            },
            "Picker requires a DOM environment.",
          )
        : null,
    );
  }

  render();
  return {
    update: render,
    destroy() {
      stop();
      unsubSelection();
    },
  };
}
