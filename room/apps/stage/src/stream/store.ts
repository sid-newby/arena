import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { zustandStateStore } from '@json-render/zustand';
import type { catalog } from '@/stage/catalog';

export type StageSpec = typeof catalog._specType;

export type StageStore = {
  /** The scene as compiled so far. Null until the first patch lands. */
  spec: StageSpec | null;
  /** json-render's state model: what `$state` bindings read and write. */
  state: Record<string, unknown>;
  patches: number;
  log: string[];
};

export const stageStore = createStore<StageStore>(() => ({
  spec: null,
  state: {},
  patches: 0,
  log: [],
}));

/** json-render reads and writes its state through this adapter, scoped to the `state` slice. */
export const stateStore = zustandStateStore({
  store: stageStore,
  selector: (store) => store.state,
  updater: (next, store) => store.setState({ state: next }),
});

export function useStage<T>(selector: (store: StageStore) => T): T {
  return useStore(stageStore, selector);
}
