import type { ReactNode } from "react";
import type {
  Catalog,
  InferCatalogComponents,
  InferComponentProps,
} from "@json-render/core";

// =============================================================================
// Remotion-specific Types
// =============================================================================

/**
 * Frame information passed to video components
 */
export interface FrameContext {
  /** Current frame number */
  frame: number;
  /** Frames per second */
  fps: number;
  /** Total duration in frames */
  durationInFrames: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Context passed to video component render functions
 */
export interface VideoComponentContext<
  C extends Catalog,
  K extends keyof InferCatalogComponents<C>,
> {
  /** Component props from the spec */
  props: InferComponentProps<C, K>;
  /** Frame information */
  frame: FrameContext;
  /** Children (for container components) */
  children?: ReactNode;
}

/**
 * Video component render function type
 *
 * @example
 * const TitleCard: VideoComponentFn<typeof catalog, 'TitleCard'> = ({ props, frame }) => {
 *   const opacity = interpolate(frame.frame, [0, 30], [0, 1]);
 *   return <div style={{ opacity }}>{props.title}</div>;
 * };
 */
export type VideoComponentFn<
  C extends Catalog,
  K extends keyof InferCatalogComponents<C>,
> = (ctx: VideoComponentContext<C, K>) => ReactNode;

/**
 * Registry of all video component render functions for a catalog
 *
 * @example
 * const components: VideoComponents<typeof myCatalog> = {
 *   TitleCard: ({ props, frame }) => <TitleCard {...props} />,
 *   ImageSlide: ({ props }) => <Img src={props.src} />,
 * };
 */
export type VideoComponents<C extends Catalog> = {
  [K in keyof InferCatalogComponents<C>]: VideoComponentFn<C, K>;
};

// =============================================================================
// Transition Types
// =============================================================================

/**
 * Transition render function
 * Returns a style object to apply during the transition
 */
export type TransitionFn = (progress: number) => React.CSSProperties;

/**
 * Built-in transition types
 */
export type BuiltInTransition =
  | "fade"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "zoom"
  | "wipe";

// =============================================================================
// Effect Types
// =============================================================================

/**
 * Infer effect params from catalog
 */
type InferCatalogEffects<C extends Catalog> = C extends {
  data: { effects: infer E };
}
  ? E
  : never;

/**
 * Effect handler function
 */
export type EffectFn<
  C extends Catalog,
  K extends keyof InferCatalogEffects<C>,
> = InferCatalogEffects<C>[K] extends { params: { _output: infer P } }
  ? (params: P, frame: FrameContext) => React.CSSProperties
  : (params: undefined, frame: FrameContext) => React.CSSProperties;

/**
 * Registry of all effect handlers for a catalog
 */
export type Effects<C extends Catalog> = {
  [K in keyof InferCatalogEffects<C>]: EffectFn<C, K>;
};
