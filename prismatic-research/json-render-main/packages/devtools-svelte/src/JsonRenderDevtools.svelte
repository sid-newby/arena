<script module lang="ts">
  import type { Catalog, Spec, StateStore } from "@json-render/core";
  import {
    markDevtoolsActive,
    registerActionObserver,
  } from "@json-render/core";
  import { getStateContext } from "@json-render/svelte";
  import {
    actionsTab,
    catalogTab,
    createEventStore,
    createPanel,
    createSelectionBus,
    highlightElement,
    isProduction,
    scanMessageParts,
    specTab,
    startPicker,
    stateTab,
    streamTab,
    type DevtoolsEvent,
    type PanelHandle,
    type PanelPosition,
  } from "@json-render/devtools";

  export type { DevtoolsEvent } from "@json-render/devtools";

  interface ChatLikeMessage {
    parts?: Array<{ type: string; text?: string; data?: unknown }>;
  }

  export interface Props {
    spec?: Spec | null;
    catalog?: Catalog | null;
    messages?: ChatLikeMessage[];
    initialOpen?: boolean;
    /**
     * Where the panel docks and where the floating toggle lives.
     * `"bottom-right"` / `"bottom-left"` dock the panel at the bottom;
     * `"right"` docks it to the right edge full-height (best for
     * app-shells that already use `100vh` / fixed bottom elements).
     */
    position?: PanelPosition;
    hotkey?: string | false;
    bufferSize?: number;
    /**
     * Reserve space via body padding while open. Default `true`.
     * When `false` the panel is a pure overlay; the CSS custom
     * properties are still published.
     */
    reserveSpace?: boolean;
    /**
     * Show a toolbar button to flip the panel between bottom-dock and
     * right-dock. Default `true`. User's choice persists to localStorage.
     * Set `false` to lock the dock to `position`.
     */
    allowDockToggle?: boolean;
    onEvent?: (evt: DevtoolsEvent) => void;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  let {
    spec = null,
    catalog = null,
    messages,
    initialOpen = false,
    position = "bottom-right",
    hotkey = "mod+shift+j",
    bufferSize = 500,
    reserveSpace = true,
    allowDockToggle = true,
    onEvent,
  }: Props = $props();

  // In production, do nothing at all.
  const skip = isProduction();

  const stateCtx = skip ? null : getStateContext();
  const store: StateStore | null = stateCtx
    ? {
        get: stateCtx.get,
        set: stateCtx.set,
        update: stateCtx.update,
        getSnapshot: stateCtx.getSnapshot,
        subscribe: () => () => {},
      }
    : null;

  const events = skip ? null : createEventStore({ bufferSize });
  const seenParts = new WeakSet<object>();

  let handle: PanelHandle | null = null;
  let releaseActive: (() => void) | null = null;
  let unsubSelection: (() => void) | null = null;
  let unsubObserver: (() => void) | null = null;
  let unsubTap: (() => void) | null = null;

  onMount(() => {
    if (!events || !store) return;

    if (onEvent) {
      unsubTap = events.subscribe(() => {
        const snap = events.snapshot();
        const last = snap[snap.length - 1];
        if (last) onEvent(last);
      });
    }

    unsubObserver = registerActionObserver({
      onDispatch(evt) {
        events.push({
          kind: "action-dispatched",
          at: evt.at,
          id: evt.id,
          name: evt.name,
          params: evt.params,
        });
      },
      onSettle(evt) {
        events.push({
          kind: "action-settled",
          at: evt.at,
          id: evt.id,
          ok: evt.ok,
          durationMs: evt.durationMs,
          result: evt.result,
          error: evt.error !== undefined ? String(evt.error) : undefined,
        });
      },
    });

    const selection = createSelectionBus();
    handle = createPanel({
      context: {
        events,
        getSpec: () => spec ?? null,
        getCatalog: () => catalog ?? null,
        getStateStore: () => store,
        startPicker: (opts) => startPicker(opts),
        selection,
        activateTab: () => {},
      },
      tabs: [
        specTab(),
        stateTab(),
        actionsTab(),
        streamTab(),
        catalogTab(),
      ],
      initialOpen,
      position,
      hotkey,
      reserveSpace,
      allowDockToggle,
    });

    unsubSelection = selection.subscribe((key) => {
      if (key) highlightElement(key);
    });
    releaseActive = markDevtoolsActive();
  });

  $effect(() => {
    if (!events || !messages) return;
    for (const msg of messages) {
      if (msg?.parts) scanMessageParts(msg.parts, events, seenParts);
    }
  });

  onDestroy(() => {
    unsubTap?.();
    unsubSelection?.();
    releaseActive?.();
    handle?.destroy();
    unsubObserver?.();
    handle = null;
  });
</script>
