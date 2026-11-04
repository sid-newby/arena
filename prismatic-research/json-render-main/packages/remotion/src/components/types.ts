/**
 * Types for Remotion timeline components
 */

/**
 * Motion state for enter/exit animations
 * Values animate FROM these values TO neutral (enter) or FROM neutral TO these values (exit)
 */
export interface MotionState {
  /** Opacity (0-1), default: 1 */
  opacity?: number;
  /** Scale multiplier (0.8 = 80%), default: 1 */
  scale?: number;
  /** Translate X in pixels, default: 0 */
  x?: number;
  /** Translate Y in pixels, default: 0 */
  y?: number;
  /** Rotation in degrees, default: 0 */
  rotate?: number;
  /** Duration in frames, default: 20 */
  duration?: number;
}

/**
 * Spring physics configuration
 */
export interface SpringConfig {
  /** Damping coefficient, default: 20 */
  damping?: number;
  /** Stiffness, default: 100 */
  stiffness?: number;
  /** Mass, default: 1 */
  mass?: number;
}

/**
 * Continuous loop animation
 */
export interface MotionLoop {
  /** Property to animate */
  property: "scale" | "rotate" | "x" | "y" | "opacity";
  /** Starting value */
  from: number;
  /** Ending value */
  to: number;
  /** Duration of one cycle in frames */
  duration: number;
  /** Easing type, default: "ease" */
  easing?: "linear" | "ease" | "spring";
}

/**
 * Declarative motion configuration for clips
 */
export interface Motion {
  /** Enter animation - animates FROM these values TO neutral */
  enter?: MotionState;
  /** Exit animation - animates FROM neutral TO these values */
  exit?: MotionState;
  /** Spring physics config (applies to enter/exit) */
  spring?: SpringConfig;
  /** Continuous looping animation */
  loop?: MotionLoop;
}

/**
 * Motion styles calculated by useMotion hook
 */
export interface MotionStyles {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
}

/**
 * Clip data passed to components
 */
export interface Clip {
  id: string;
  trackId: string;
  component: string;
  props: Record<string, unknown>;
  from: number;
  durationInFrames: number;
  transitionIn?: { type: string; durationInFrames: number };
  transitionOut?: { type: string; durationInFrames: number };
  /** Declarative motion configuration */
  motion?: Motion;
}

/**
 * Timeline spec structure
 */
export interface TimelineSpec {
  composition?: {
    id: string;
    fps: number;
    width: number;
    height: number;
    durationInFrames: number;
  };
  tracks?: { id: string; name: string; type: string; enabled: boolean }[];
  clips?: Clip[];
  audio?: { tracks: AudioTrack[] };
}

/**
 * Audio track in the timeline
 */
export interface AudioTrack {
  id: string;
  src: string;
  from: number;
  durationInFrames: number;
  volume: number;
}

/**
 * Transition styles calculated by useTransition hook
 */
export interface TransitionStyles {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
}

/**
 * Component render function type
 */
export type ClipComponent = React.ComponentType<{ clip: Clip }>;

/**
 * Component registry type
 */
export type ComponentRegistry = Record<string, ClipComponent>;
