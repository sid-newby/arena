# @json-render/devtools-svelte

Svelte adapter for the [json-render devtools](https://json-render.dev/docs/devtools). Drop-in `<JsonRenderDevtools />` component.

## Installation

```bash
npm install @json-render/devtools @json-render/devtools-svelte
```

Peer dep: `svelte@^5`.

## Usage

```svelte
<script>
  import { JsonRenderDevtools } from "@json-render/devtools-svelte";
</script>

<JSONUIProvider {registry}>
  <Renderer {spec} {registry} />
  <JsonRenderDevtools {spec} {catalog} {messages} />
</JSONUIProvider>
```

- Floating toggle appears bottom-right.
- Hotkey: `Ctrl`/`Cmd` + `Shift` + `J`.
- Tree-shakes to nothing in production builds.

See the [devtools docs](https://json-render.dev/docs/devtools) for the full prop reference and panel tour.

## License

Apache-2.0
