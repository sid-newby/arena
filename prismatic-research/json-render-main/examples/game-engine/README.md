# Game Engine Example

A 3D scene editor and lightweight game runtime built with json-render, React Three Fiber, and Rapier physics. Edit levels as structured objects, preview them on a canvas, then press play for first/third-person movement, physics, health/damage, NPCs, and optional AI-assisted editing.

## What it shows

- **3D rendering with json-render** -- the editor's scene graph is converted to a json-render `Spec` via `sceneToSpec`, then rendered with `ThreeRenderer` and the `@json-render/react-three-fiber` registry.
- **AI scene editing** -- type a prompt in the editor sidebar; the server streams YAML patches that are merged into the current spec, updating the 3D scene in real time.
- **In-game AI** -- while playing, an AI agent can manipulate the scene by streaming JSONL function calls (`addObject`, `updateObjectTransform`, etc.).
- **Play mode with physics** -- toggle between edit mode (gizmos, selection) and play mode (Rapier physics, first/third-person controls, health, damage zones, collectibles).
- **NPC dialogue with optional TTS** -- `GameCharacter` components support AI-generated dialogue, with optional ElevenLabs text-to-speech.
- **GLB uploads** -- upload custom 3D models and environments via Vercel Blob.

## Setup

```bash
pnpm install          # from the monorepo root
cd examples/game-engine
cp .env.example .env
```

Set the required environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Vercel AI Gateway key |
| `AI_GATEWAY_MODEL` | No | Defaults to `anthropic/claude-sonnet-4-6` |
| `ELEVENLABS_API_KEY` | No | Enables text-to-speech for NPC dialogue |
| `KV_REST_API_URL` | No | Upstash Redis URL for rate limiting |
| `KV_REST_API_TOKEN` | No | Upstash Redis token |
| `RATE_LIMIT_PER_MINUTE` | No | Defaults to `10` |
| `RATE_LIMIT_PER_DAY` | No | Defaults to `100` |

Model/environment uploads require Vercel Blob configuration when deployed.

## Run

```bash
pnpm dev
# http://game-engine-demo.json-render.localhost:1355
```

Requires global [`portless`](https://github.com/vercel-labs/portless). The `predev` script checks for it automatically.

## Files

- `app/page.tsx` -- mounts `GameEngine`
- `components/game-engine.tsx` -- main shell: R3F canvas, sidebars, play/edit mode toggle, AI prompt integration
- `components/game/` -- game primitives (`GameBox`, `GameSphere`, `Player`, `GameCharacter`, etc.) with physics and interactions
- `components/editor/` -- editor UI: object inspector, scene tree, AI prompt sidebar, gizmo controls
- `components/hud/` -- in-game HUD: health bar, crosshair, in-game AI prompt
- `app/api/ai/route.ts` -- streams YAML scene edits from the model
- `app/api/ai-game/route.ts` -- streams JSONL function calls for in-game AI manipulation
- `app/api/character-responses/route.ts` -- generates NPC dialogue, optionally with TTS
- `lib/catalog.ts` -- 3D component catalog (R3F base + game-specific primitives)
- `lib/registry.tsx` -- maps catalog types to R3F and game components
- `lib/store.ts` -- Zustand store for scenes, selection, play mode, health, undo/redo
- `lib/scene-to-spec.ts` / `lib/spec-to-scene.ts` -- converts between the editor's scene graph and json-render specs
