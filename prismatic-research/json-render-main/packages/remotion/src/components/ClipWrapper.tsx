"use client";

import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useTransition, useMotion } from "./hooks";
import type { Clip } from "./types";

interface ClipWrapperProps {
  clip: Clip;
  children: React.ReactNode;
}

/**
 * Wrapper component that applies transition and motion animations to clips
 *
 * Automatically handles:
 * - transitionIn/transitionOut: basic transition presets (fade, slide, zoom, etc.)
 * - motion: declarative enter/exit/loop animations with spring physics
 *
 * Transitions and motion compose together:
 * - Opacity: multiplied (both affect final opacity)
 * - Transforms: added (both contribute to final position/scale/rotation)
 */
export function ClipWrapper({ clip, children }: ClipWrapperProps) {
  const frame = useCurrentFrame();
  const absoluteFrame = frame + clip.from;

  // Get transition styles (from transitionIn/transitionOut)
  const transition = useTransition(clip, absoluteFrame);

  // Get motion styles (from motion.enter/exit/loop)
  const motion = useMotion(clip, absoluteFrame);

  // Compose styles: multiply opacity, add transforms
  const composedOpacity = transition.opacity * motion.opacity;
  const composedTranslateX = transition.translateX + motion.translateX;
  const composedTranslateY = transition.translateY + motion.translateY;
  const composedScale = transition.scale * motion.scale;
  const composedRotate = motion.rotate; // Only from motion (transitions don't rotate)

  return (
    <AbsoluteFill
      style={{
        opacity: composedOpacity,
        transform: `translateX(${composedTranslateX}%) translateY(${composedTranslateY}%) scale(${composedScale}) rotate(${composedRotate}deg)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
