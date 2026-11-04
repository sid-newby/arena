"use client";

// =============================================================================
// @json-render/next — Client exports
//
// This entry point includes client components and is safe to import
// in "use client" modules and Next.js pages/layouts.
// =============================================================================

// Provider
export {
  NextAppProvider,
  useNextApp,
  type NextAppProviderProps,
  type NextAppContextValue,
} from "./components/provider";

// Page renderer
export {
  PageRenderer,
  type PageRendererProps,
} from "./components/page-renderer";

// Error boundary
export {
  NextErrorBoundary,
  type NextErrorBoundaryProps,
} from "./components/error-boundary";

// Loading
export {
  NextLoading,
  type NextLoadingProps,
} from "./components/loading-renderer";

// Not found
export { NextNotFound } from "./components/not-found-renderer";

// Link component
export { Link, type LinkProps } from "./components/link";

// Types (re-exported for convenience)
export type {
  NextAppSpec,
  NextRouteSpec,
  NextMetadata,
  MatchedRoute,
  LoaderFn,
  CreateNextAppOptions,
  NextAppExports,
  PageData,
} from "./types";

// Catalog types (re-exported from @json-render/react)
export type {
  EventHandle,
  BaseComponentProps,
  SetState,
  StateModel,
  ComponentContext,
  ComponentFn,
  Components,
  ActionFn,
  Actions,
} from "./catalog-types";

// Core types (re-exported for convenience)
export type { Spec, StateStore } from "@json-render/core";
export { createStateStore } from "@json-render/core";
export type {
  ComponentRegistry,
  ComponentRenderProps,
} from "@json-render/react";
