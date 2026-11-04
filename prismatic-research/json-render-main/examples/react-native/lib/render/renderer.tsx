import React, { type ReactNode, useMemo } from "react";
import {
  Renderer,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
  ValidationProvider,
  createStandardActionHandlers,
  type Spec,
} from "@json-render/react-native";
import { registry } from "./registry";

// =============================================================================
// AppRenderer
// =============================================================================

interface AppRendererProps {
  spec: Spec | null;
  loading?: boolean;
}

export function AppRenderer({ spec, loading }: AppRendererProps): ReactNode {
  // Seed the StateProvider with any initial state from the spec.
  // Memoize so we only pick up the state from the first render of this spec
  // (otherwise re-renders during streaming would keep resetting the state).
  // NOTE: This hook must be called before any early return to satisfy Rules of Hooks.
  const initialState = useMemo(
    () => spec?.state ?? {},
    // Re-seed when the spec root changes (new generation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec?.root],
  );

  if (!spec) return null;

  return (
    <StateProvider initialState={initialState}>
      <VisibilityProvider>
        <ActionProvider handlers={createStandardActionHandlers()}>
          <ValidationProvider>
            <Renderer spec={spec} registry={registry} loading={loading} />
          </ValidationProvider>
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
