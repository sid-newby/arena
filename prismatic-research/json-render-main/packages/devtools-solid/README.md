# @json-render/devtools-solid

SolidJS adapter for the [json-render devtools](https://json-render.dev/docs/devtools). Drop-in `<JsonRenderDevtools />` component.

## Installation

```bash
npm install @json-render/devtools @json-render/devtools-solid
```

Peer dep: `solid-js@^1.9`.

## Usage

```tsx
import { JsonRenderDevtools } from "@json-render/devtools-solid";

<JSONUIProvider registry={registry}>
  <Renderer spec={spec()} registry={registry} />
  <JsonRenderDevtools
    spec={spec()}
    catalog={catalog}
    messages={messages()}
  />
</JSONUIProvider>;
```

- Floating toggle appears bottom-right.
- Hotkey: `Ctrl`/`Cmd` + `Shift` + `J`.
- Tree-shakes to `null` in production builds.

See the [devtools docs](https://json-render.dev/docs/devtools) for the full prop reference and panel tour.

## License

Apache-2.0
