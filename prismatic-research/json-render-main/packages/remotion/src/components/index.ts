// Types
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
} from "./types";

// Hooks
export { useTransition, useMotion } from "./hooks";

// Wrapper
export { ClipWrapper } from "./ClipWrapper";

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
} from "./standard";

// Renderer
export { Renderer, standardComponents } from "./Renderer";
