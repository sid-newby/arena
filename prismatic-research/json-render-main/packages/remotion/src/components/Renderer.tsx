"use client";

import React, { type ErrorInfo, type ReactNode } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { TimelineSpec, ComponentRegistry, Clip } from "./types";

// Import standard components
import {
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

/**
 * Standard components provided by @json-render/remotion
 */
export const standardComponents: ComponentRegistry = {
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
};

// ---------------------------------------------------------------------------
// ClipErrorBoundary – catches rendering errors in individual clips so
// a single bad clip never crashes the entire composition.
// ---------------------------------------------------------------------------

interface ClipErrorBoundaryProps {
  clipId: string;
  component: string;
  children: ReactNode;
}

interface ClipErrorBoundaryState {
  hasError: boolean;
}

class ClipErrorBoundary extends React.Component<
  ClipErrorBoundaryProps,
  ClipErrorBoundaryState
> {
  constructor(props: ClipErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ClipErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[json-render/remotion] Rendering error in clip "${this.props.clipId}" (<${this.props.component}>):`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface RendererProps {
  /** The timeline spec to render */
  spec: TimelineSpec;
  /**
   * Custom component registry to merge with standard components.
   * Custom components override standard ones with the same name.
   */
  components?: ComponentRegistry;
}

/**
 * Renders a timeline spec into Remotion components
 *
 * @example
 * // Use with standard components only
 * <Renderer spec={mySpec} />
 *
 * @example
 * // Add custom components
 * <Renderer
 *   spec={mySpec}
 *   components={{
 *     CustomScene: MyCustomSceneComponent,
 *   }}
 * />
 */
export function Renderer({
  spec,
  components: customComponents,
}: RendererProps) {
  // Merge standard + custom components (custom overrides standard)
  const components: ComponentRegistry = {
    ...standardComponents,
    ...customComponents,
  };

  if (!spec.clips || spec.clips.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#1a1a2e",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.5 }}>No clips</div>
      </AbsoluteFill>
    );
  }

  // Separate main track clips from overlay clips
  const mainClips = spec.clips.filter((c) => c.trackId === "main");
  const overlayClips = spec.clips.filter((c) => c.trackId === "overlay");

  const renderClip = (clip: Clip) => {
    const Component = components[clip.component];
    if (!Component) {
      console.warn(`Unknown component: ${clip.component}`);
      return null;
    }

    return (
      <Sequence
        key={clip.id}
        from={clip.from}
        durationInFrames={clip.durationInFrames}
      >
        <ClipErrorBoundary clipId={clip.id} component={clip.component}>
          <Component clip={clip} />
        </ClipErrorBoundary>
      </Sequence>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Main track clips */}
      {mainClips.map(renderClip)}

      {/* Overlay clips */}
      {overlayClips.map(renderClip)}
    </AbsoluteFill>
  );
}
