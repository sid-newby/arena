# Devtools example

An AI-powered chat where each assistant reply streams a fresh `Spec` that renders inline. A single `<JsonRenderDevtools />` panel observes **every** rendered spec, **every** streamed patch, **every** state change, and **every** dispatched action across the whole page — demonstrating how one devtools instance works with many renderers.

Pairs with [`@json-render/devtools`](../../packages/devtools) and [`@json-render/devtools-react`](../../packages/devtools-react).

## What it shows

- **AI-streamed specs (inline mode)** — the agent writes a short conversational reply, then emits a `` ```spec `` fence of RFC 6902 JSON patches. `pipeJsonRender` on the server splits that into `data-spec` parts and plain text parts; the client re-assembles both with `useJsonRenderMessage`.
- **One renderer per assistant message, one devtools panel** — every message gets its own `<Renderer />`, but they share a single top-level `<JSONUIProvider>`, so the devtools State / Actions / Stream tabs see the whole page, not just one message.
- **State namespacing per turn** — the API route hands the agent a unique `messageId` and requires every element key (`<id>-root`, `<id>-counter`, …) and state path (`/<id>/count`, `/<id>/todos`) to be prefixed with it, so specs from different messages never collide on shared state.
- **Built-ins exercised** — `setState`, `pushState`, `removeState`, plus `inc`/`dec`/`toggle`/`add` computed functions, `$bindState`, `$template`, `$state`, `repeat`, `$item`, `$index`, and conditional `visible`.
- **The Pick panel across renderers** — because every element is tagged with `data-jr-key`, picking an element in any assistant bubble jumps to its spec in the panel.

## Setup

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local and set AI_GATEWAY_API_KEY
```

Grab an AI Gateway key at <https://vercel.com/ai-gateway>. On Vercel the key is auto-authenticated, so you only need this for local dev.

## Run

```bash
pnpm dev
# http://devtools-demo.json-render.localhost:1355
```

Press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>J</kbd> (or click the floating `{}` badge) to toggle the panel. It starts open by default.

## Files

- `app/page.tsx` — chat UI, top-level `<JSONUIProvider>`, per-message `<Renderer />`, `<JsonRenderDevtools>` mount
- `app/api/chat/route.ts` — streams the agent through `pipeJsonRender`
- `lib/agent.ts` — `ToolLoopAgent` with a system prompt that enforces inline mode + `messageId`-based namespacing
- `lib/catalog.ts` — compact catalog (Card, Stack, Grid, Metric, Button, TextInput, Checkbox, List, ProgressBar, Callout, …) tuned to show off devtools
- `lib/registry.tsx` — component renderers with plain inline styles, no UI framework

## Try these prompts

- "Build an interactive counter with + and - buttons" — Actions tab lights up with `setState` dispatches.
- "Make a todo list where I can add items, mark them done, and remove them" — exercises `pushState` / `removeState` and `$bindState` inputs.
- "Show me a fitness dashboard with three metrics and progress bars" — metric-heavy spec; handy for the Spec tree + State inspector.
- "Quiz me on three geography questions with a submit button that reveals my score" — uses bindings plus conditional visibility.

Then send a second prompt in the same session and watch the Stream tab keep appending patches while the State tab shows both turns' namespaced keys side by side.
