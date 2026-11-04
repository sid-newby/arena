# Prismatic Research Center

A backdrop the arena's seats paint on while they talk. The stage is a 1920x1080 virtual
space scaled to fit the window; agents place nodes on it through a
[json-render](https://github.com/vercel-labs/json-render) catalog, never by writing markup.

|            |                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Port       | `127.0.0.1:58243`, started by `pnpm dev` at the workspace root or `pnpm --filter @bay01/stage dev`                |
| Plan       | [prismatic-research/stage-scaffold-plan.md](../../../prismatic-research/stage-scaffold-plan.md) at the arena root |
| Spec shape | json-render's flat element map: `{ root, elements: { id: { type, props, children } } }`                           |
| Status     | Steps 1–3 of the plan. The scene in `src/stage/demo.ts` is hard-coded; nothing streams yet.                       |

## Catalog

Every positioned node carries one `transform` block (`src/stage/transform.ts`): `x`, `y`,
`w`, `h`, `rotate`, `opacity`, `z`, and named `enter` and `exit` presets. Agents learn it once.

| Type                       | What it is                                                             |
| -------------------------- | ---------------------------------------------------------------------- |
| `Stage`                    | The root. One per scene.                                               |
| `Backdrop`                 | Full-stage solid or gradient, exactly one, always at z 0.              |
| `Text`                     | Positioned text on a fixed scale: display, title, body, caption, mono. |
| `Shape`                    | Positioned rect, circle, or line.                                      |
| `Caption`                  | Full-width line pinned to the top or bottom edge, above everything.    |
| `Card`, `Heading`, `Badge` | From `@json-render/shadcn`, for side-panel chrome.                     |

`catalog.prompt()` is the agent's only documentation of the stage; the side panel shows its
size. Enter presets map to CSS keyframes in `src/index.css` and respect reduced motion. Exit
presets are declared but not yet animated.

## Next

Steps 4 onward in the plan: a Zustand store fed by the SpecStream compiler, a mock agent that
streams a scene, ambient effects and shader backdrops, the sandboxed frame for HyperFrames
compositions, the asset store, and the Nest endpoints that validate, log, and broadcast ops.
