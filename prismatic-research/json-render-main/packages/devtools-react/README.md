# @json-render/devtools-react

React adapter for the [json-render devtools](https://json-render.dev/docs/devtools). Drop-in `<JsonRenderDevtools />` component.

## Installation

```bash
npm install @json-render/devtools @json-render/devtools-react
```

Peer dep: `react@^19`.

## Usage

```tsx
import { JsonRenderDevtools } from "@json-render/devtools-react";

<JSONUIProvider registry={registry} handlers={handlers}>
  <Renderer spec={spec} registry={registry} />
  <JsonRenderDevtools spec={spec} catalog={catalog} messages={messages} />
</JSONUIProvider>;
```

- Floating toggle appears bottom-right.
- Hotkey: `Ctrl`/`Cmd` + `Shift` + `J`.
- Tree-shakes to `null` in production builds.

## Imperative API

```tsx
import { useJsonRenderDevtools } from "@json-render/devtools-react";

const devtools = useJsonRenderDevtools();
devtools?.open();
devtools?.toggle();
devtools?.recordEvent({ kind: "stream-text", at: Date.now(), text: "hi" });
```

See the [devtools docs](https://json-render.dev/docs/devtools) for the full prop reference and panel tour.

## License

Apache-2.0
