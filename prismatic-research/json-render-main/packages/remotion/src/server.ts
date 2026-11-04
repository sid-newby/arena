/**
 * Server-safe exports for @json-render/remotion
 *
 * This entry point only exports schema and catalog definitions,
 * without any React or Remotion runtime dependencies.
 * Use this in server components, API routes, and build scripts.
 *
 * @example
 * ```ts
 * // In an API route or server component
 * import { schema, standardComponentDefinitions } from "@json-render/remotion/server";
 * ```
 */

// Schema (no React dependencies)
export { schema, type RemotionSchema, type RemotionSpec } from "./schema";

// Catalog definitions (no React dependencies)
export {
  standardComponentDefinitions,
  standardTransitionDefinitions,
  standardEffectDefinitions,
  type ComponentDefinition,
  type TransitionDefinition,
  type EffectDefinition,
} from "./catalog";

// Catalog types (type-only exports)
export type {
  FrameContext,
  VideoComponentContext,
  VideoComponentFn,
  VideoComponents,
  TransitionFn,
  BuiltInTransition,
  EffectFn,
  Effects,
} from "./catalog-types";

// Core types (re-exported for convenience)
export type { Spec } from "@json-render/core";
