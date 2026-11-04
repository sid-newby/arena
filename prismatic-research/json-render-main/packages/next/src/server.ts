/**
 * @json-render/next/server — Server-safe exports
 *
 * This entry point does not import any client components or React hooks.
 * Safe to use in:
 * - Server Components
 * - API routes
 * - Build scripts
 * - Server Actions
 *
 * @example
 * ```ts
 * import { createNextApp, schema } from "@json-render/next/server";
 * ```
 */

// createNextApp (main API)
export { createNextApp } from "./create-app";

// Schema (Next.js app spec format)
export { schema, type NextSchema, type NextSpec } from "./schema";

// Router utilities
export { matchRoute, slugToPath, collectStaticParams } from "./router";

// Metadata resolution
export { resolveMetadata, type ResolvedMetadata } from "./metadata";

// Types
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

// Catalog types (type-only, no runtime)
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
