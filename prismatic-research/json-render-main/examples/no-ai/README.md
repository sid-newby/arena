# No-AI Example

Static JSON specs rendered with json-render -- no AI required. This example demonstrates that json-render works as a standalone UI renderer without any LLM, streaming, or backend. Hand-authored specs are rendered client-side with `JSONUIProvider` and `Renderer`.

## What it shows

- **json-render without AI** -- specs are plain JSON objects defined in code; no API routes, no streaming, no environment variables.
- **Interactive forms** -- `$bindState` for two-way input binding, `$cond` for conditional visibility, `checks` for field validation, and a `validateForm` action.
- **Computed functions** -- `$computed` with custom functions like `formatAddress` and `citiesForCountry` for derived values.
- **Watch and cascading state** -- `watch` triggers `setState` actions when a value changes, enabling cascading select patterns.
- **Templates** -- `$template` for string interpolation with state values.
- **Custom actions** -- a `confetti` action wired to `react-confetti-explosion`.

## Demos

The app includes several tabbed demos:

- **Confetti** -- custom action integration
- **Layouts** -- cards, stacks, grids, typography, badges, progress bars, pricing tables, status dashboards
- **Forms** -- state binding, inputs, selects, switches, validation
- **Registration form** -- `$template`, `$cond`, cross-field checks, `validateForm`, conditional visibility
- **Cascading selects** -- `watch` + `setState`, `$computed`, `$template`

## Setup

```bash
pnpm install          # from the monorepo root
cd examples/no-ai
```

No environment variables are needed.

## Run

```bash
pnpm dev
# http://no-ai-demo.json-render.localhost:1355
```

Requires global [`portless`](https://github.com/vercel-labs/portless). The `predev` script checks for it automatically.

## Files

- `app/page.tsx` -- tabbed gallery rendering each demo spec with `JSONUIProvider` and `Renderer`
- `lib/examples.ts` -- all demo specs as static `Spec` objects
- `lib/render/catalog.ts` -- component catalog using shadcn component definitions, with a `confetti` action and custom functions
- `lib/render/registry.tsx` -- registry mapping shadcn components, the `confetti` action handler, and computed function implementations
