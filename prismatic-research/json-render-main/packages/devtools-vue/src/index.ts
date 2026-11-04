import {
  defineComponent,
  onBeforeUnmount,
  onMounted,
  watch,
  type PropType,
} from "vue";
import type { Catalog, Spec, StateStore } from "@json-render/core";
import { markDevtoolsActive, registerActionObserver } from "@json-render/core";
import { useStateStore } from "@json-render/vue";
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
  type EventStore,
  type PanelContext,
  type PanelHandle,
  type PanelPosition,
} from "@json-render/devtools";

interface ChatLikeMessage {
  parts?: Array<{ type: string; text?: string; data?: unknown }>;
}

/**
 * Drop this component anywhere inside a `<JSONUIProvider>` to get a
 * floating devtools panel. In production builds it renders nothing.
 *
 * @example
 * ```vue
 * <script setup>
 * import { JsonRenderDevtools } from "@json-render/devtools-vue";
 * </script>
 *
 * <template>
 *   <JSONUIProvider :registry="registry">
 *     <Renderer :spec="spec" :registry="registry" />
 *     <JsonRenderDevtools :spec="spec" :catalog="catalog" :messages="messages" />
 *   </JSONUIProvider>
 * </template>
 * ```
 */
export const JsonRenderDevtools = defineComponent({
  name: "JsonRenderDevtools",
  props: {
    spec: {
      type: Object as PropType<Spec | null>,
      default: null,
    },
    catalog: {
      type: Object as PropType<Catalog | null>,
      default: null,
    },
    messages: {
      type: Array as PropType<ChatLikeMessage[]>,
      default: undefined,
    },
    initialOpen: { type: Boolean, default: false },
    position: {
      type: String as PropType<PanelPosition>,
      default: "bottom-right",
    },
    hotkey: {
      type: [String, Boolean] as PropType<string | false>,
      default: "mod+shift+j",
    },
    bufferSize: { type: Number, default: 500 },
    /**
     * Reserve space for the panel by applying body padding while open.
     * Default `true`. Set `false` to keep the panel as a pure overlay.
     */
    reserveSpace: { type: Boolean, default: true },
    /**
     * Show a toolbar button to flip the panel between bottom-dock and
     * right-dock. Default `true`. The user's choice persists across
     * reloads. Set `false` to lock the dock to `position`.
     */
    allowDockToggle: { type: Boolean, default: true },
    onEvent: {
      type: Function as PropType<(evt: DevtoolsEvent) => void>,
      default: undefined,
    },
  },
  setup(props) {
    if (isProduction()) return () => null;

    const stateCtx = useStateStore();
    const store: StateStore = {
      get: stateCtx.get,
      set: stateCtx.set,
      update: stateCtx.update,
      getSnapshot: stateCtx.getSnapshot,
      subscribe: () => () => {},
    };

    const events: EventStore = createEventStore({
      bufferSize: props.bufferSize,
    });

    // External tap.
    const unsubTap = props.onEvent
      ? events.subscribe(() => {
          const snap = events.snapshot();
          const last = snap[snap.length - 1];
          if (last) props.onEvent?.(last);
        })
      : () => {};

    // Action observer -> event store.
    const unsubObserver = registerActionObserver({
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

    // Stream event capture from chat messages.
    const seenParts = new WeakSet<object>();
    const stopMessagesWatch = watch(
      () => props.messages,
      (messages) => {
        if (!messages) return;
        for (const msg of messages) {
          if (msg?.parts) scanMessageParts(msg.parts, events, seenParts);
        }
      },
      { deep: true, immediate: true },
    );

    let handle: PanelHandle | null = null;
    let releaseActive: (() => void) | null = null;
    let unsubSelection: (() => void) | null = null;

    onMounted(() => {
      const selection = createSelectionBus();
      const ctx: PanelContext = {
        events,
        getSpec: () => props.spec ?? null,
        getCatalog: () => props.catalog ?? null,
        getStateStore: () => store,
        startPicker: (opts) => startPicker(opts),
        selection,
        activateTab: () => {},
      };

      handle = createPanel({
        context: ctx,
        tabs: [specTab(), stateTab(), actionsTab(), streamTab(), catalogTab()],
        initialOpen: props.initialOpen,
        position: props.position,
        hotkey: props.hotkey,
        reserveSpace: props.reserveSpace,
        allowDockToggle: props.allowDockToggle,
      });

      unsubSelection = selection.subscribe((key) => {
        if (key) highlightElement(key);
      });
      releaseActive = markDevtoolsActive();
    });

    onBeforeUnmount(() => {
      unsubSelection?.();
      releaseActive?.();
      handle?.destroy();
      handle = null;
      stopMessagesWatch();
      unsubObserver();
      unsubTap();
    });

    return () => null;
  },
});

export type { DevtoolsEvent } from "@json-render/devtools";
