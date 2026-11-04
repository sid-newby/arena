"use client";

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { ClipWrapper } from "./ClipWrapper";
import type { Clip } from "./types";

// =============================================================================
// TitleCard - Full-screen title with optional subtitle
// =============================================================================

export function TitleCard({ clip }: { clip: Clip }) {
  const { title, subtitle, backgroundColor, textColor } = clip.props as {
    title: string;
    subtitle?: string;
    backgroundColor?: string;
    textColor?: string;
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill
        style={{
          backgroundColor: backgroundColor || "#1a1a2e",
          color: textColor || "#ffffff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: "bold",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 36,
              opacity: 0.7,
              textAlign: "center",
            }}
          >
            {subtitle}
          </div>
        )}
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// ImageSlide - Full-screen image display
// =============================================================================

export function ImageSlide({ clip }: { clip: Clip }) {
  const { src, alt, fit, backgroundColor } = clip.props as {
    src: string;
    alt: string;
    fit?: "cover" | "contain";
    backgroundColor?: string;
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill
        style={{
          backgroundColor: backgroundColor || "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: fit || "cover",
            }}
          />
        ) : (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 24 }}>
            [{alt}]
          </div>
        )}
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// SplitScreen - Two-panel comparison view
// =============================================================================

export function SplitScreen({ clip }: { clip: Clip }) {
  const { leftTitle, rightTitle, leftColor, rightColor } = clip.props as {
    leftTitle: string;
    rightTitle: string;
    leftColor?: string;
    rightColor?: string;
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
        <div
          style={{
            flex: 1,
            backgroundColor: leftColor || "#1a1a2e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
          }}
        >
          <div style={{ fontSize: 48, fontWeight: "bold" }}>{leftTitle}</div>
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: rightColor || "#2e1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
          }}
        >
          <div style={{ fontSize: 48, fontWeight: "bold" }}>{rightTitle}</div>
        </div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// QuoteCard - Quote with attribution
// =============================================================================

export function QuoteCard({ clip }: { clip: Clip }) {
  const { quote, author, backgroundColor, textColor, transparent } =
    clip.props as {
      quote: string;
      author?: string;
      backgroundColor?: string;
      textColor?: string;
      transparent?: boolean;
    };

  // Use transparent background for overlays, or specified color, or default dark
  const bgColor = transparent ? "transparent" : backgroundColor || "#1a1a2e";

  const color = textColor || "#ffffff";

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          color,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontStyle: "italic",
            textAlign: "center",
            marginBottom: 24,
            textShadow: transparent ? "2px 2px 8px rgba(0,0,0,0.8)" : "none",
          }}
        >
          &ldquo;{quote}&rdquo;
        </div>
        {author && (
          <div
            style={{
              fontSize: 28,
              opacity: 0.9,
              textShadow: transparent ? "1px 1px 4px rgba(0,0,0,0.8)" : "none",
            }}
          >
            - {author}
          </div>
        )}
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// StatCard - Large statistic display with animation
// =============================================================================

export function StatCard({ clip }: { clip: Clip }) {
  const { value, label, prefix, suffix, backgroundColor } = clip.props as {
    value: string | number;
    label: string;
    prefix?: string;
    suffix?: string;
    backgroundColor?: string;
  };

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animate the number counting up
  const animationProgress = spring({
    frame,
    fps,
    config: { damping: 100 },
    durationInFrames: 30,
  });

  const numValue = typeof value === "number" ? value : parseFloat(value) || 0;
  const displayValue = Math.round(numValue * animationProgress);

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill
        style={{
          backgroundColor: backgroundColor || "#1a1a2e",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: "bold", marginBottom: 16 }}>
          {prefix || ""}
          {typeof value === "number" ? displayValue : value}
          {suffix || ""}
        </div>
        <div style={{ fontSize: 32, opacity: 0.7 }}>{label}</div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// LowerThird - Name/title overlay
// =============================================================================

export function LowerThird({ clip }: { clip: Clip }) {
  const { name, title } = clip.props as {
    name: string;
    title?: string;
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: 40,
            backgroundColor: "rgba(0,0,0,0.8)",
            color: "#ffffff",
            padding: "16px 24px",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: "bold" }}>{name}</div>
          {title && <div style={{ fontSize: 20, opacity: 0.7 }}>{title}</div>}
        </div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// TextOverlay - Simple text overlay
// =============================================================================

export function TextOverlay({ clip }: { clip: Clip }) {
  const { text, position, fontSize } = clip.props as {
    text: string;
    position?: "top" | "center" | "bottom";
    fontSize?: "small" | "medium" | "large";
  };

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { top: 100, left: 0, right: 0 },
    center: { top: "50%", left: 0, right: 0, transform: "translateY(-50%)" },
    bottom: { bottom: 100, left: 0, right: 0 },
  };

  const fontSizes: Record<string, number> = {
    small: 24,
    medium: 36,
    large: 56,
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            ...positionStyles[position || "center"],
            textAlign: "center",
            color: "#ffffff",
            fontSize: fontSizes[fontSize || "medium"],
            padding: 20,
            textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// TypingText - Terminal-style typing animation
// =============================================================================

export function TypingText({ clip }: { clip: Clip }) {
  const {
    text,
    backgroundColor,
    textColor,
    fontSize,
    fontFamily,
    showCursor = true,
    cursorChar = "|",
    charsPerSecond = 15,
  } = clip.props as {
    text: string;
    backgroundColor?: string;
    textColor?: string;
    fontSize?: number;
    fontFamily?: "monospace" | "sans-serif" | "serif";
    showCursor?: boolean;
    cursorChar?: string;
    charsPerSecond?: number;
  };

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate how many characters to show based on current frame
  const framesPerChar = fps / charsPerSecond;
  const charsToShow = Math.min(Math.floor(frame / framesPerChar), text.length);
  const displayedText = text.slice(0, charsToShow);
  const isTypingComplete = charsToShow >= text.length;

  // Blinking cursor (blinks every 0.5 seconds)
  const cursorVisible =
    showCursor &&
    (Math.floor(frame / (fps / 2)) % 2 === 0 || !isTypingComplete);

  const fontFamilyMap: Record<string, string> = {
    monospace: "'Courier New', Consolas, monospace",
    "sans-serif": "system-ui, -apple-system, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill
        style={{
          backgroundColor: backgroundColor || "#1e1e1e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        <div
          style={{
            color: textColor || "#00ff00",
            fontSize: fontSize || 48,
            fontFamily: fontFamilyMap[fontFamily || "monospace"],
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxWidth: "90%",
            textAlign: "left",
          }}
        >
          {displayedText}
          {cursorVisible && (
            <span
              style={{
                opacity: isTypingComplete
                  ? Math.floor(frame / (fps / 2)) % 2 === 0
                    ? 1
                    : 0
                  : 1,
              }}
            >
              {cursorChar}
            </span>
          )}
        </div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// LogoBug - Corner watermark/logo
// =============================================================================

export function LogoBug({ clip }: { clip: Clip }) {
  const { position, opacity: propOpacity } = clip.props as {
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    opacity?: number;
  };

  const positionStyles: Record<string, React.CSSProperties> = {
    "top-left": { top: 20, left: 20 },
    "top-right": { top: 20, right: 20 },
    "bottom-left": { bottom: 20, left: 20 },
    "bottom-right": { bottom: 20, right: 20 },
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            ...positionStyles[position || "bottom-right"],
            opacity: propOpacity ?? 0.5,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: "bold",
            textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          LOGO
        </div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}

// =============================================================================
// VideoClip - Video file playback (placeholder)
// =============================================================================

export function VideoClip({ clip }: { clip: Clip }) {
  const { src } = clip.props as {
    src: string;
    startFrom?: number;
    volume?: number;
  };

  return (
    <ClipWrapper clip={clip}>
      <AbsoluteFill
        style={{
          backgroundColor: "#000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        <div>[Video: {src}]</div>
      </AbsoluteFill>
    </ClipWrapper>
  );
}
