# @json-render/remotion

Remotion video renderer for json-render. Turn JSON timeline specs into video compositions.

## Installation

```bash
npm install @json-render/remotion @json-render/core remotion @remotion/player zod
```

## Quick Start

### 1. Create a Catalog

```typescript
import { defineCatalog } from "@json-render/core";
import {
  schema,
  standardComponentDefinitions,
  standardTransitionDefinitions,
  standardEffectDefinitions,
} from "@json-render/remotion";

// Use standard definitions or add your own
export const videoCatalog = defineCatalog(schema, {
  components: {
    ...standardComponentDefinitions,
    // Add custom components here
  },
  transitions: standardTransitionDefinitions,
  effects: standardEffectDefinitions,
});
```

### 2. Render with the Player

```tsx
import { Player } from "@remotion/player";
import { Renderer } from "@json-render/remotion";

function VideoPlayer({ spec }) {
  return (
    <Player
      component={Renderer}
      inputProps={{ spec }}
      durationInFrames={spec.composition.durationInFrames}
      fps={spec.composition.fps}
      compositionWidth={spec.composition.width}
      compositionHeight={spec.composition.height}
      controls
    />
  );
}
```

## Timeline Spec Format

```typescript
interface TimelineSpec {
  composition: {
    id: string;
    fps: number;
    width: number;
    height: number;
    durationInFrames: number;
  };
  tracks: Array<{
    id: string;
    name: string;
    type: "video" | "overlay" | "audio";
    enabled: boolean;
  }>;
  clips: Array<{
    id: string;
    trackId: string;
    component: string;         // Component name from catalog
    props: object;             // Component-specific props
    from: number;              // Start frame
    durationInFrames: number;
    transitionIn?: {
      type: string;
      durationInFrames: number;
    };
    transitionOut?: {
      type: string;
      durationInFrames: number;
    };
  }>;
  audio: {
    tracks: Array<{
      id: string;
      src: string;
      from: number;
      durationInFrames: number;
      volume?: number;
    }>;
  };
}
```

Example spec:

```json
{
  "composition": {
    "id": "intro-video",
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "durationInFrames": 300
  },
  "tracks": [
    { "id": "main", "name": "Main Video", "type": "video", "enabled": true },
    { "id": "overlay", "name": "Overlays", "type": "overlay", "enabled": true }
  ],
  "clips": [
    {
      "id": "clip-1",
      "trackId": "main",
      "component": "TitleCard",
      "props": {
        "title": "Welcome",
        "subtitle": "To the future",
        "backgroundColor": "#1a1a1a",
        "textColor": "#ffffff"
      },
      "from": 0,
      "durationInFrames": 90,
      "transitionIn": { "type": "fade", "durationInFrames": 15 },
      "transitionOut": { "type": "fade", "durationInFrames": 15 }
    }
  ],
  "audio": { "tracks": [] }
}
```

## Standard Components

The package includes pre-built video components:

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `TitleCard` | Full-screen title with subtitle | `title`, `subtitle`, `backgroundColor`, `textColor` |
| `ImageSlide` | Full-screen image display | `src`, `alt`, `fit` |
| `SplitScreen` | Two-column layout | `leftTitle`, `rightTitle`, `leftContent`, `rightContent` |
| `QuoteCard` | Quote with attribution | `quote`, `author`, `role` |
| `StatCard` | Large statistic display | `value`, `label`, `trend` |
| `LowerThird` | Name/title overlay | `name`, `title` |
| `TextOverlay` | Centered text | `text`, `fontSize`, `fontFamily` |
| `TypingText` | Terminal typing effect | `text`, `charsPerSecond`, `showCursor` |
| `LogoBug` | Corner logo overlay | `src`, `position`, `size` |
| `VideoClip` | Video playback | `src` |

## Standard Transitions

| Transition | Description |
|------------|-------------|
| `fade` | Opacity fade in/out |
| `slideLeft` | Slide from right |
| `slideRight` | Slide from left |
| `slideUp` | Slide from bottom |
| `slideDown` | Slide from top |
| `zoom` | Scale zoom in/out |
| `wipe` | Horizontal wipe |

## Custom Components

Add custom components to the Renderer:

```tsx
import { Renderer, standardComponents, ClipWrapper } from "@json-render/remotion";
import type { Clip } from "@json-render/remotion";

// Define a custom component
function CustomOverlay({ clip }: { clip: Clip }) {
  return (
    <ClipWrapper clip={clip}>
      <div style={{ backgroundColor: clip.props.color }}>
        {clip.props.message}
      </div>
    </ClipWrapper>
  );
}

// Merge with standard components
const customComponents = {
  ...standardComponents,
  CustomOverlay,
};

// Pass to Renderer
<Player
  component={Renderer}
  inputProps={{ spec, components: customComponents }}
  // ...
/>
```

## Hooks and Utilities

### useTransition

Calculate transition styles for a clip:

```tsx
import { useTransition } from "@json-render/remotion";
import { useCurrentFrame } from "remotion";

function MyComponent({ clip }: { clip: Clip }) {
  const frame = useCurrentFrame();
  const transition = useTransition(clip, frame);

  return (
    <div style={{ opacity: transition.opacity }}>
      Content
    </div>
  );
}
```

### ClipWrapper

Apply transitions automatically:

```tsx
import { ClipWrapper } from "@json-render/remotion";

function MyComponent({ clip }: { clip: Clip }) {
  return (
    <ClipWrapper clip={clip}>
      {/* Content gets transition styles applied */}
      <div>My content</div>
    </ClipWrapper>
  );
}
```

## Generate AI Prompts

```typescript
const systemPrompt = videoCatalog.prompt();
// Returns detailed prompt with:
// - Component descriptions and props
// - Transition types
// - Effect definitions
// - Timeline spec format requirements
```

## Exports

### Components

```typescript
import {
  // Main renderer
  Renderer,
  standardComponents,

  // Standard components
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

  // Utilities
  ClipWrapper,
  useTransition,
} from "@json-render/remotion";
```

### Types

```typescript
import type {
  Clip,
  TimelineSpec,
  AudioTrack,
  TransitionStyles,
  ClipComponent,
  ComponentRegistry,
} from "@json-render/remotion";
```

### Schema and Catalog Definitions

```typescript
import {
  schema,
  standardComponentDefinitions,
  standardTransitionDefinitions,
  standardEffectDefinitions,
} from "@json-render/remotion";
```

## Why Different from React?

| Feature | @json-render/react | @json-render/remotion |
|---------|-------------------|----------------------|
| Spec Format | Element tree (nested components) | Timeline (tracks + clips) |
| Components | UI components (Button, Card) | Video components (scenes, overlays) |
| Timing | User interactions | Frame-based animations |
| Output | React DOM | Remotion video |

json-render is "JSON to render" - the spec format and components are completely flexible per renderer.
