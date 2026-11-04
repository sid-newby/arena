# Prismatic Research Center

A backdrop the arena's seats paint on while they talk. The stage is a 1920x1080 virtual
space scaled to fit the window; agents place nodes on it through a
[json-render](https://github.com/vercel-labs/json-render) catalog, never by writing markup.

|            |                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Port       | `127.0.0.1:58243`, started by `pnpm dev` at the workspace root or `pnpm --filter @bay01/stage dev`                |
| Plan       | [prismatic-research/stage-scaffold-plan.md](../../../prismatic-research/stage-scaffold-plan.md) at the arena root |
| Spec shape | json-render's flat element map: `{ root, elements: { id: { type, props, children } } }`                           |
| Status     | Steps 1–6 of the plan. A mock agent streams the scene in `src/stage/demo.ts` as JSON Patch lines; no API yet.     |

## Catalog

Every positioned node carries one `transform` block (`src/stage/transform.ts`): `x`, `y`,
`w`, `h`, `rotate`, `opacity`, `z`, and named `enter` and `exit` presets. Agents learn it once.

| Type                       | What it is                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stage`                    | The root. One per scene.                                                                                                                           |
| `Backdrop`                 | Full-stage solid, gradient, or an animated WebGL shader preset (noise, aurora, scanlines, plasma) tinted by hex stops. Exactly one, always at z 0. |
| `Fog`, `Grain`, `Vignette` | Ambient band (z 10–19): drifting haze, film grain, edge darkening. One to three params each.                                                       |
| `SandboxFrame`             | The escape hatch: agent HTML, CSS and JS in a positioned iframe. Overlay band (z 90+). A whole HyperFrames composition drops in as `html`.         |
| `Text`                     | Positioned text on a fixed scale: display, title, body, caption, mono.                                                                             |
| `Shape`                    | Positioned rect, circle, or line.                                                                                                                  |
| `Caption`                  | Full-width line pinned to the top or bottom edge, above everything.                                                                                |
| `Card`, `Heading`, `Badge` | From `@json-render/shadcn`, for side-panel chrome.                                                                                                 |

`catalog.prompt()` is the agent's only documentation of the stage; the side panel shows its
size. Enter presets map to CSS keyframes in `src/index.css` and respect reduced motion. Exit
presets are declared but not yet animated.

## Streaming

The scene arrives as JSONL patches (RFC 6902), one line per op. `src/stream/client.ts` feeds
any async iterable of text chunks through json-render's SpecStream compiler and writes the
compiled spec into the Zustand store in `src/stream/store.ts`. The same store holds json-render's
state model in its `state` slice, so `$state` bindings read and write through Zustand. The
side panel counts patches and shows the last forty. **Replay scene** restarts the mock agent in
`src/agent/mock.ts`, which adds the root, then one node every 450 ms, appending each to the
root's children as it lands.

## Sandbox

`SandboxFrame` renders its document with `srcdoc` into an iframe carrying `sandbox="allow-scripts"` and
nothing else, so the frame has an opaque origin and cannot reach the parent page, cookies, or
storage. `src/stage/sandbox.ts` injects a Content Security Policy into the document: inline
code and https CDNs may run, images, media and fonts may load, and `connect-src`,
`frame-src`, `form-action` and `base-uri` are all `'none'`. A fragment is wrapped in a
document; a full document keeps its shape and gets the policy and any `css` and `js` injected.
The demo's rain is one of these.

## Next

Steps 7 onward in the plan: the sandboxed frame for HyperFrames
compositions, the asset store, and the Nest endpoints that validate, log, and broadcast ops.
