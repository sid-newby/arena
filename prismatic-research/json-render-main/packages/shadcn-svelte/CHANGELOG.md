# @json-render/shadcn-svelte

## 0.16.0

### Minor Changes

- 519a538: Add Next.js renderer and shadcn-svelte component library.

  ### New:
  - **`@json-render/next`** -- Next.js renderer that turns JSON specs into full Next.js applications with routes, layouts, SSR, metadata, data loaders, and static generation. Client and server entry points at `@json-render/next` and `@json-render/next/server`. Includes built-in `Link`, `Slot`, error boundary, loading, and not-found components.
  - **`@json-render/shadcn-svelte`** -- Pre-built shadcn-svelte components for json-render Svelte apps. 36 components built on Svelte 5 + Tailwind CSS with state binding, validation, and action support. Server-safe catalog at `@json-render/shadcn-svelte/catalog`.

### Patch Changes

- Updated dependencies [519a538]
  - @json-render/core@0.16.0
  - @json-render/svelte@0.16.0
