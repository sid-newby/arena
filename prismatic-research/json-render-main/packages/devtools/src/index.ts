// Types
export type {
  DevtoolsEvent,
  DevtoolsEventKind,
  TokenUsage,
  PickerOptions,
  PickerSession,
} from "./types";

// Event store (ring buffer)
export {
  createEventStore,
  type EventStore,
  type EventStoreOptions,
} from "./event-store";

// Production guard
export { isProduction } from "./prod-guard";

// Panel (vanilla-TS UI)
export {
  createPanel,
  createStubTab,
  createSelectionBus,
  h,
  formatTime,
  jsonPreview,
  replaceChildren,
  specTab,
  stateTab,
  actionsTab,
  streamTab,
  catalogTab,
  pickerTab,
  buildCatalogDisplayData,
} from "./panel";

// Picker
export {
  DEVTOOLS_KEY_ATTR,
  findElementByKey,
  findAllElementsByKey,
  highlightElement,
  setHoverHighlight,
  startPicker,
} from "./picker";

// Stream tap utilities
export {
  tapJsonRenderStream,
  tapYamlStream,
  scanMessageParts,
  extractSpecFromParts,
  recordUsage,
  recordEvent,
} from "./stream-tap";
export type {
  PanelContext,
  PanelHandle,
  PanelOptions,
  PanelPosition,
  SelectionBus,
  SpecEntry,
  TabDef,
  TabInstance,
} from "./panel";
