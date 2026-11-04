import { z } from "zod";

/**
 * Standard component definitions for Remotion catalogs
 *
 * These can be used directly or extended with custom components.
 */
export const standardComponentDefinitions = {
  // ==========================================================================
  // Scene Components (full-screen)
  // ==========================================================================

  TitleCard: {
    props: z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      backgroundColor: z.string().nullable(),
      textColor: z.string().nullable(),
    }),
    type: "scene",
    defaultDuration: 90,
    description:
      "Full-screen title card with centered text. Use for intros, outros, and section breaks.",
    example: { title: "Welcome", subtitle: "An introduction" },
  },

  ImageSlide: {
    props: z.object({
      src: z.string(),
      alt: z.string(),
      fit: z.enum(["cover", "contain"]).nullable(),
      backgroundColor: z.string().nullable(),
    }),
    type: "image",
    defaultDuration: 150,
    description:
      "Full-screen image display. Use for product shots, photos, and visual content.",
    example: {
      src: "https://picsum.photos/1920/1080?random=1",
      alt: "Hero image",
      fit: "cover",
    },
  },

  SplitScreen: {
    props: z.object({
      leftTitle: z.string(),
      rightTitle: z.string(),
      leftColor: z.string().nullable(),
      rightColor: z.string().nullable(),
    }),
    type: "scene",
    defaultDuration: 120,
    description:
      "Split screen with two sides. Use for comparisons or before/after.",
  },

  QuoteCard: {
    props: z.object({
      quote: z.string(),
      author: z.string().nullable(),
      backgroundColor: z.string().nullable(),
      textColor: z.string().nullable(),
      transparent: z.boolean().nullable(),
    }),
    type: "scene",
    defaultDuration: 150,
    description:
      "Quote display with author. Props: quote, author, textColor, backgroundColor. Set transparent:true when using as overlay on images.",
    example: {
      quote: "The best way to predict the future is to invent it.",
      author: "Alan Kay",
    },
  },

  StatCard: {
    props: z.object({
      value: z.string(),
      label: z.string(),
      prefix: z.string().nullable(),
      suffix: z.string().nullable(),
      backgroundColor: z.string().nullable(),
    }),
    type: "scene",
    defaultDuration: 90,
    description: "Large statistic display. Use for key metrics and numbers.",
    example: { value: "10M+", label: "Users worldwide", prefix: "" },
  },

  TypingText: {
    props: z.object({
      text: z.string(),
      backgroundColor: z.string().nullable(),
      textColor: z.string().nullable(),
      fontSize: z.number().nullable(),
      fontFamily: z.enum(["monospace", "sans-serif", "serif"]).nullable(),
      showCursor: z.boolean().nullable(),
      cursorChar: z.string().nullable(),
      charsPerSecond: z.number().nullable(),
    }),
    type: "scene",
    defaultDuration: 180,
    description:
      "Terminal-style typing animation that reveals text character by character. Perfect for code demos, CLI commands, and dramatic text reveals.",
  },

  // ==========================================================================
  // Overlay Components
  // ==========================================================================

  LowerThird: {
    props: z.object({
      name: z.string(),
      title: z.string().nullable(),
      backgroundColor: z.string().nullable(),
    }),
    type: "overlay",
    defaultDuration: 120,
    description:
      "Name/title overlay in lower third of screen. Use to identify speakers.",
  },

  TextOverlay: {
    props: z.object({
      text: z.string(),
      position: z.enum(["top", "center", "bottom"]).nullable(),
      fontSize: z.enum(["small", "medium", "large"]).nullable(),
    }),
    type: "overlay",
    defaultDuration: 90,
    description: "Simple text overlay. Use for captions and annotations.",
  },

  LogoBug: {
    props: z.object({
      position: z
        .enum(["top-left", "top-right", "bottom-left", "bottom-right"])
        .nullable(),
      opacity: z.number().nullable(),
    }),
    type: "overlay",
    defaultDuration: 300,
    description: "Corner logo watermark. Use for branding throughout video.",
  },

  // ==========================================================================
  // Video Components
  // ==========================================================================

  VideoClip: {
    props: z.object({
      src: z.string(),
      startFrom: z.number().nullable(),
      volume: z.number().nullable(),
    }),
    type: "video",
    defaultDuration: 150,
    description: "Video file playback. Use for B-roll and footage.",
  },
};

/**
 * Standard transition definitions for Remotion catalogs
 */
export const standardTransitionDefinitions = {
  fade: {
    defaultDuration: 15,
    description: "Smooth fade in/out. Use for gentle transitions.",
  },
  slideLeft: {
    defaultDuration: 20,
    description: "Slide from right to left. Use for forward progression.",
  },
  slideRight: {
    defaultDuration: 20,
    description: "Slide from left to right. Use for backward progression.",
  },
  slideUp: {
    defaultDuration: 15,
    description: "Slide from bottom to top. Use for overlays appearing.",
  },
  slideDown: {
    defaultDuration: 15,
    description: "Slide from top to bottom. Use for overlays disappearing.",
  },
  zoom: {
    defaultDuration: 20,
    description: "Zoom in/out effect. Use for emphasis.",
  },
  wipe: {
    defaultDuration: 15,
    description: "Horizontal wipe. Use for scene changes.",
  },
  none: {
    defaultDuration: 0,
    description: "No transition (hard cut).",
  },
};

/**
 * Standard effect definitions for Remotion catalogs
 */
export const standardEffectDefinitions = {
  kenBurns: {
    params: z.object({
      startScale: z.number(),
      endScale: z.number(),
      panX: z.number().nullable(),
      panY: z.number().nullable(),
    }),
    description: "Ken Burns pan and zoom effect for images.",
  },
  pulse: {
    params: z.object({
      intensity: z.number(),
    }),
    description: "Subtle pulsing scale effect for emphasis.",
  },
  shake: {
    params: z.object({
      intensity: z.number(),
    }),
    description: "Camera shake effect for energy.",
  },
};

/**
 * Type for component definition
 */
export type ComponentDefinition = {
  props: z.ZodType;
  type: string;
  defaultDuration: number;
  description: string;
};

/**
 * Type for transition definition
 */
export type TransitionDefinition = {
  defaultDuration: number;
  description: string;
};

/**
 * Type for effect definition
 */
export type EffectDefinition = {
  params: z.ZodType;
  description: string;
};
