// Schema (Remotion's timeline-based spec format)
export { schema, type RemotionSchema, type RemotionSpec } from "./schema";

// Catalog-aware types for Remotion
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

// =============================================================================
// Components - Pre-built Remotion components for rendering timelines
// =============================================================================

// Component types
export type {
  Clip,
  TimelineSpec,
  AudioTrack,
  TransitionStyles,
  MotionStyles,
  Motion,
  MotionState,
  MotionLoop,
  SpringConfig,
  ClipComponent,
  ComponentRegistry,
} from "./components";

// Hooks and utilities
export { useTransition, useMotion, ClipWrapper } from "./components";

// Standard components
export {
  TitleCard,
  ImageSlide,
  SplitScreen,
  QuoteCard,
  StatCard,
  LowerThird,
  TextOverlay,
  TypingText,
  LogoBug,
  VideoClip,
} from "./components";

// Renderer and component registry
export { Renderer, standardComponents } from "./components";

// =============================================================================
// Catalog Definitions - Pre-built definitions for use in catalogs
// =============================================================================

export {
  standardComponentDefinitions,
  standardTransitionDefinitions,
  standardEffectDefinitions,
  type ComponentDefinition,
  type TransitionDefinition,
  type EffectDefinition,
} from "./catalog";
