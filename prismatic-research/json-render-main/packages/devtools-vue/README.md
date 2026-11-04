# @json-render/devtools-vue

Vue adapter for the [json-render devtools](https://json-render.dev/docs/devtools). Drop-in `<JsonRenderDevtools />` component.

## Installation

```bash
npm install @json-render/devtools @json-render/devtools-vue
```

Peer dep: `vue@^3.5`.

## Usage

```vue
<script setup>
import { JsonRenderDevtools } from "@json-render/devtools-vue";
</script>

<template>
  <JSONUIProvider :registry="registry">
    <Renderer :spec="spec" :registry="registry" />
    <JsonRenderDevtools :spec="spec" :catalog="catalog" :messages="messages" />
  </JSONUIProvider>
</template>
```

- Floating toggle appears bottom-right.
- Hotkey: `Ctrl`/`Cmd` + `Shift` + `J`.
- Tree-shakes to nothing in production builds.

See the [devtools docs](https://json-render.dev/docs/devtools) for the full prop reference and panel tour.

## License

Apache-2.0
