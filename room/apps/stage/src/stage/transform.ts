import type { CSSProperties } from 'react';
import { z } from 'zod';

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export const enterPresets = ['none', 'fade', 'drift-up', 'drift-in', 'scale', 'blur-in'] as const;
export const exitPresets = ['none', 'fade', 'drift-down', 'scale', 'blur-out'] as const;

/** Shared placement block. Agents learn it once; every positioned node carries one. */
export const Transform = z.object({
  x: z.number().min(0).max(STAGE_WIDTH),
  y: z.number().min(0).max(STAGE_HEIGHT),
  w: z.number().min(1).max(STAGE_WIDTH).nullable(),
  h: z.number().min(1).max(STAGE_HEIGHT).nullable(),
  rotate: z.number().min(-360).max(360).nullable(),
  opacity: z.number().min(0).max(1).nullable(),
  z: z.number().int().min(0).max(199).nullable(),
  enter: z.enum(enterPresets).nullable(),
  exit: z.enum(exitPresets).nullable(),
});
export type Transform = z.infer<typeof Transform>;

export function nodeStyle(transform: Transform): CSSProperties {
  return {
    left: transform.x,
    top: transform.y,
    width: transform.w ?? undefined,
    height: transform.h ?? undefined,
    rotate: `${transform.rotate ?? 0}deg`,
    opacity: transform.opacity ?? 1,
    zIndex: transform.z ?? 20,
  };
}
