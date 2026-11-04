# Agent Stage — Scaffold Plan

> **Status:** draft for review · **Stack:** Vite · React 19 · Tailwind 4 · shadcn/Radix · Zod 4 · `@json-render/*` 0.21.4
> **Goal:** a backdrop where agents place pre-built components to storytell, set moods, or mess around — no runtime handed to the agent, only a catalog.

---

## 1. Shape of the thing

```
┌──────────────────────────────────────────────────────────────────┐
│  Agent (tool calls / NL / catalog #)                             │
│      │  JSONL patches (RFC 6902) or whole spec                   │
│      ▼                                                           │
│  /api/stage  ── Zod validate against catalog ── append op log    │
│      │                                                           │
│      ▼  SSE                                                      │
│  Browser: SpecStream compiler → Zustand StateStore → <Stage/>    │
│                                                                  │
│   <Stage/>  = 1920×1080 virtual space, scaled to fit             │
│     ├─ backdrop band   (z 0–9)    Backdrop                       │
│     ├─ ambient band    (z 10–19)  Grain · Vignette · Fog         │
│     ├─ content band    (z 20–89)  Text · Image · Video · Shape   │
│     └─ overlay band    (z 90+)    Caption · SandboxFrame         │
│                                                                  │
│   <Panel/>  = shadcn catalog (36 components) for chrome/controls │
└──────────────────────────────────────────────────────────────────┘
```

**Two catalogs, merged with `mergeCatalogs`:**

| Catalog | Package | Lives in | Purpose |
|---|---|---|---|
| `stageCatalog` | ours | `src/stage/catalog.ts` | positioned nodes on the backdrop |
| `shadcnCatalog` | `@json-render/shadcn` | import | side panel, dialogs, controls, "summon" UI |

The agent sees one merged prompt via `catalog.prompt()`. The renderer routes by type: stage types go through `<StageRenderer>`, everything else through the stock `<Renderer>`.

---

## 2. Stage node contract

Every stage component shares a `transform` block so placement is uniform and agents learn it once:

```ts
// src/stage/transform.ts
export const Transform = z.object({
  x: z.number().min(0).max(1920),
  y: z.number().min(0).max(1080),
  w: z.number().min(1).max(1920).nullable(),   // null = natural width
  h: z.number().min(1).max(1080).nullable(),
  rotate: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  z: z.number().int().min(0).max(199).default(20),
  enter: z.enum(["none", "fade", "drift-up", "drift-in", "scale", "blur-in"]).default("fade"),
  exit:  z.enum(["none", "fade", "drift-down", "scale", "blur-out"]).default("fade"),
});
```

Then each component is `props: z.object({ ...its own stuff, transform: Transform })`. Enter/exit are **named presets** mapped to Motion variants — agents pick a word, not keyframes.

---

## 3. Seed stage catalog (v0)

| Type | Props (beyond `transform`) | Notes |
|---|---|---|
| `Backdrop` | `kind: solid \| gradient \| image \| video \| shader`, `color`, `stops[]`, `assetId`, `shader: z.enum([...])` | Exactly one. z forced to 0. Shaders are a fixed enum of GLSL presets (`noise`, `aurora`, `scanlines`, `plasma`), **not** agent-written GLSL. |
| `Text` | `text`, `variant: display \| title \| body \| caption \| mono`, `align`, `color`, `maxWidth` | Variants map to a typographic scale; no raw font props. |
| `Image` | `assetId`, `fit: cover \| contain`, `radius`, `shadow: bool` | `assetId` resolves through the asset store. |
| `Video` | `assetId`, `loop: true`, `muted: true`, `fit`, `playbackRate`, `fadeIn` | Ambient/fire-and-forget. No seek model. |
| `Shape` | `kind: rect \| circle \| line`, `fill`, `stroke`, `strokeWidth` | |
| `Caption` | `text`, `style: subtitle \| speech \| label`, `anchor: top \| bottom` | |
| `Grain` / `Vignette` / `Fog` | 1–3 params each (`amount`, `color`, `speed`) | Full-stage, ambient band only. |
| `SandboxFrame` | `html`, `css`, `js`, `allow: z.array(z.enum([...]))` | Escape hatch. `srcdoc`, `sandbox="allow-scripts"`, no `allow-same-origin`, CSP meta injected. Hyperframes comps drop straight in. |

Keep it at ~10. Descriptions are one sentence + one example each; the catalog prompt is the agent's only documentation.

---

## 4. Asset store

Agents can't invent `src`. They get:

- `list_assets(query?, kind?)` → `[{ id, kind, name, w, h, duration?, tags[] }]`
- `assetId` everywhere in the catalog, never a URL
- Resolver in the renderer: `assetId → signed URL` (Supabase Storage is the obvious fit if you're already on it; local `/assets/*.json` manifest for the spike)
- Rejects at validation if `assetId` doesn't exist → agent gets the Zod error and retries

Upload path for humans only in v0. Agent-generated assets (image gen, hyperframes render → mp4) land in the same store later.

---

## 5. Summoning: how agents (and triggers) build scenes

Three entry points, all landing on the same validated op pipeline:

| Entry | Shape | Example |
|---|---|---|
| **Tool calls** | `stage.add / update / remove / set_backdrop / animate / clear` | Agent's normal loop; one tool per op, JSON schema generated from the Zod catalog |
| **Natural language** | `POST /api/stage/compose { prompt }` → LLM with `catalog.prompt()` → streamed spec | "make it feel like 3am in a rainy city" |
| **Catalog number / preset** | `stage.summon("mood:rainy-night")` or `#42` | Named scene presets stored as specs; triggers / hooks fire these |

Op log is append-only (`{ ts, actor, op }`). Replay = scene. Undo = truncate. Multi-agent = last-writer-wins per node id until that hurts.

Streaming: server emits JSONL patches; client runs `createSpecStreamCompiler()` from `@json-render/core` and pushes chunks straight into the Zustand StateStore via `@json-render/zustand`.

---

## 6. File layout

```
src/
  main.tsx
  App.tsx                      # layout: <Stage/> + <Panel/>
  stage/
    catalog.ts                 # defineCatalog(schema, { components: {...}, actions })
    transform.ts               # shared Transform schema + Motion presets
    registry.tsx               # defineRegistry(catalog, { components })
    Stage.tsx                  # 1920x1080 virtual space, scale-to-fit, z bands
    StageRenderer.tsx          # routes stage types to positioned wrappers
    components/
      Backdrop.tsx  Text.tsx  Image.tsx  Video.tsx  Shape.tsx
      Caption.tsx   Grain.tsx Vignette.tsx Fog.tsx  SandboxFrame.tsx
    shaders/                   # preset GLSL strings
  panel/
    catalog.ts                 # pick from shadcnComponentDefinitions
    Panel.tsx
  assets/
    store.ts                   # list / resolve
    manifest.json              # spike-only
  stream/
    client.ts                  # SSE → SpecStream compiler → store
    store.ts                   # zustand + @json-render/zustand adapter
  agent/
    tools.ts                   # Zod catalog → tool JSON schema
    mock.ts                    # fake agent that streams a scene (for the spike)
server/
  index.ts                     # /api/stage (validate, log, broadcast) + /api/stage/compose
```

---

## 7. Build order

| Step | What | Done when |
|---|---|---|
| 1 | `pnpm create vite` + Tailwind 4 + shadcn init; install package.json below | `pnpm dev` renders a blank stage |
| 2 | `Transform` + `Stage.tsx` scale-to-fit + z bands | hard-coded spec with 3 nodes renders at the right spots |
| 3 | Stage catalog + registry for Backdrop/Text/Image/Shape | `catalog.prompt()` prints something an agent could use |
| 4 | Zustand store + SpecStream client; `agent/mock.ts` streams a scene | watch a scene build node by node |
| 5 | Video, Caption, ambient fx (Grain/Vignette/Fog), shader backdrops | the "rainy 3am" preset looks like something |
| 6 | `SandboxFrame` with CSP; drop a Hyperframes comp in | an agent-written HTML experiment runs isolated |
| 7 | Asset store + `list_assets` tool; `assetId` validation | agent can't reference a non-existent asset |
| 8 | `server/index.ts`: validate → op log → SSE; real tool schemas from Zod | your actual agents can drive it |
| 9 | `@json-render/devtools-react` panel wired up | spec tree / stream log visible without console spelunking |

Steps 1–4 are the spike. If it feels wrong there, nothing else matters.

---

## 8. Decisions to confirm before step 3

1. **Vite 8 or stay on your current Vite major?** Package.json below uses latest; swap if your repo pins older.
2. **Tailwind 4 confirmed?** `@json-render/shadcn` peer-requires `^4.0.0`. If you're on v3, the shadcn catalog won't install cleanly — you'd use your own shadcn components with the catalog definitions only.
3. **Zod 4 confirmed?** Core peer-requires `^4.0.0`. Zod 3 schemas don't type-check at the `defineCatalog` boundary.
4. **Shader backdrops: preset enum only, or let agents write GLSL inside `SandboxFrame`?** Plan says enum; the sandbox is there if you want to loosen it.
5. **Where does the op log live?** In-memory for the spike; Supabase table after.

---

## 9. Where Vercel's examples are

All in `vercel-labs/json-render` on GitHub:

| Path | Why you care |
|---|---|
| `examples/vite-renderers` | **Vite + React** (plus Vue/Svelte/Solid) — closest to your setup, no Next.js |
| `examples/chat` | streaming spec from an LLM into the renderer |
| `apps/web` | docs + playground (`json-render.dev/playground`) |
| `skills/core`, `skills/react`, `skills/shadcn`, `skills/zustand`, `skills/yaml` | **agent skills** — `npx skills add vercel-labs/json-render` teaches your coding agents the catalog/spec/streaming conventions. Install these first. |
| `packages/remotion` | timeline/clip spec if you ever want sequenced video on-stage instead of Hyperframes |
| `packages/react-three-fiber` | 20 3D components incl. Gaussian splats — tempting rabbit hole, not v0 |
| `AGENTS.md` | their own conventions doc |

Run the whole monorepo locally: `git clone … && pnpm install && pnpm dev` → `http://json-render.localhost:1355`.
