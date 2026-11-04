"use client";

import { useVideoConfig, spring, interpolate } from "remotion";
import type { Clip, TransitionStyles, MotionStyles } from "./types";

/**
 * Calculate transition styles based on clip configuration
 *
 * Handles both transitionIn and transitionOut with support for:
 * - fade
 * - slideLeft / slideRight
 * - slideUp / slideDown
 * - zoom
 * - wipe
 */
export function useTransition(clip: Clip, frame: number): TransitionStyles {
  const { fps } = useVideoConfig();
  const relativeFrame = frame - clip.from;
  const clipEnd = clip.durationInFrames;

  let opacity = 1;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;

  // Transition in
  if (clip.transitionIn && relativeFrame < clip.transitionIn.durationInFrames) {
    const progress = relativeFrame / clip.transitionIn.durationInFrames;
    const easedProgress = spring({
      frame: relativeFrame,
      fps,
      config: { damping: 200 },
      durationInFrames: clip.transitionIn.durationInFrames,
    });

    switch (clip.transitionIn.type) {
      case "fade":
        opacity = easedProgress;
        break;
      case "slideLeft":
        translateX = interpolate(easedProgress, [0, 1], [100, 0]);
        opacity = easedProgress;
        break;
      case "slideRight":
        translateX = interpolate(easedProgress, [0, 1], [-100, 0]);
        opacity = easedProgress;
        break;
      case "slideUp":
        translateY = interpolate(easedProgress, [0, 1], [100, 0]);
        opacity = easedProgress;
        break;
      case "slideDown":
        translateY = interpolate(easedProgress, [0, 1], [-100, 0]);
        opacity = easedProgress;
        break;
      case "zoom":
        scale = interpolate(easedProgress, [0, 1], [0.8, 1]);
        opacity = easedProgress;
        break;
      case "wipe":
        opacity = progress;
        break;
    }
  }

  // Transition out
  if (
    clip.transitionOut &&
    relativeFrame > clipEnd - clip.transitionOut.durationInFrames
  ) {
    const outStart = clipEnd - clip.transitionOut.durationInFrames;
    const outProgress =
      (relativeFrame - outStart) / clip.transitionOut.durationInFrames;
    const easedOutProgress = 1 - outProgress;

    switch (clip.transitionOut.type) {
      case "fade":
        opacity = Math.min(opacity, easedOutProgress);
        break;
      case "slideLeft":
        translateX = interpolate(outProgress, [0, 1], [0, -100]);
        opacity = Math.min(opacity, easedOutProgress);
        break;
      case "slideRight":
        translateX = interpolate(outProgress, [0, 1], [0, 100]);
        opacity = Math.min(opacity, easedOutProgress);
        break;
      case "slideUp":
        translateY = interpolate(outProgress, [0, 1], [0, -100]);
        opacity = Math.min(opacity, easedOutProgress);
        break;
      case "slideDown":
        translateY = interpolate(outProgress, [0, 1], [0, 100]);
        opacity = Math.min(opacity, easedOutProgress);
        break;
      case "zoom":
        scale = interpolate(outProgress, [0, 1], [1, 1.2]);
        opacity = Math.min(opacity, easedOutProgress);
        break;
    }
  }

  return { opacity, translateX, translateY, scale };
}

/**
 * Calculate motion styles based on clip's motion configuration
 *
 * Handles declarative motion:
 * - enter: animate FROM values TO neutral
 * - exit: animate FROM neutral TO values
 * - loop: continuous animation during clip lifetime
 * - spring: physics-based easing
 */
export function useMotion(clip: Clip, frame: number): MotionStyles {
  const { fps } = useVideoConfig();
  const relativeFrame = frame - clip.from;
  const clipEnd = clip.durationInFrames;

  // Default neutral values
  let opacity = 1;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let rotate = 0;

  const motion = clip.motion;
  if (!motion) {
    return { opacity, translateX, translateY, scale, rotate };
  }

  // Spring config with defaults
  const springConfig = {
    damping: motion.spring?.damping ?? 20,
    stiffness: motion.spring?.stiffness ?? 100,
    mass: motion.spring?.mass ?? 1,
  };

  // Enter animation
  if (motion.enter) {
    const enterDuration = motion.enter.duration ?? 20;

    if (relativeFrame < enterDuration) {
      const progress = spring({
        frame: relativeFrame,
        fps,
        config: springConfig,
        durationInFrames: enterDuration,
      });

      // Interpolate FROM enter values TO neutral (1, 0, 0, 1, 0)
      if (motion.enter.opacity !== undefined) {
        opacity = interpolate(progress, [0, 1], [motion.enter.opacity, 1]);
      }
      if (motion.enter.scale !== undefined) {
        scale = interpolate(progress, [0, 1], [motion.enter.scale, 1]);
      }
      if (motion.enter.x !== undefined) {
        translateX = interpolate(progress, [0, 1], [motion.enter.x, 0]);
      }
      if (motion.enter.y !== undefined) {
        translateY = interpolate(progress, [0, 1], [motion.enter.y, 0]);
      }
      if (motion.enter.rotate !== undefined) {
        rotate = interpolate(progress, [0, 1], [motion.enter.rotate, 0]);
      }
    }
  }

  // Exit animation
  if (motion.exit) {
    const exitDuration = motion.exit.duration ?? 20;
    const exitStart = clipEnd - exitDuration;

    if (relativeFrame >= exitStart) {
      const exitFrame = relativeFrame - exitStart;
      const progress = spring({
        frame: exitFrame,
        fps,
        config: springConfig,
        durationInFrames: exitDuration,
      });

      // Interpolate FROM neutral TO exit values
      if (motion.exit.opacity !== undefined) {
        const exitOpacity = interpolate(
          progress,
          [0, 1],
          [1, motion.exit.opacity],
        );
        opacity = Math.min(opacity, exitOpacity);
      }
      if (motion.exit.scale !== undefined) {
        const exitScale = interpolate(progress, [0, 1], [1, motion.exit.scale]);
        // Multiply scales for composition
        scale = scale * exitScale;
      }
      if (motion.exit.x !== undefined) {
        const exitX = interpolate(progress, [0, 1], [0, motion.exit.x]);
        translateX = translateX + exitX;
      }
      if (motion.exit.y !== undefined) {
        const exitY = interpolate(progress, [0, 1], [0, motion.exit.y]);
        translateY = translateY + exitY;
      }
      if (motion.exit.rotate !== undefined) {
        const exitRotate = interpolate(
          progress,
          [0, 1],
          [0, motion.exit.rotate],
        );
        rotate = rotate + exitRotate;
      }
    }
  }

  // Loop animation (continuous during clip)
  if (motion.loop) {
    const { property, from, to, duration, easing = "ease" } = motion.loop;

    // Calculate loop progress (0-1 repeating)
    const loopFrame = relativeFrame % duration;
    let loopProgress: number;

    switch (easing) {
      case "linear":
        loopProgress = loopFrame / duration;
        break;
      case "spring":
        loopProgress = spring({
          frame: loopFrame,
          fps,
          config: springConfig,
          durationInFrames: duration,
        });
        break;
      case "ease":
      default:
        // Sine ease in-out for smooth looping
        loopProgress = interpolate(
          loopFrame,
          [0, duration / 2, duration],
          [0, 1, 0],
          { extrapolateRight: "clamp" },
        );
        break;
    }

    const loopValue = interpolate(loopProgress, [0, 1], [from, to]);

    switch (property) {
      case "opacity":
        opacity = opacity * loopValue;
        break;
      case "scale":
        scale = scale * loopValue;
        break;
      case "x":
        translateX = translateX + loopValue;
        break;
      case "y":
        translateY = translateY + loopValue;
        break;
      case "rotate":
        rotate = rotate + loopValue;
        break;
    }
  }

  return { opacity, translateX, translateY, scale, rotate };
}
