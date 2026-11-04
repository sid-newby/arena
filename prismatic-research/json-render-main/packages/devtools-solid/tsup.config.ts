import { defineConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  esbuildPlugins: [solidPlugin({ solid: { generate: "dom" } })],
  external: [
    "solid-js",
    "@json-render/core",
    "@json-render/core/store-utils",
    "@json-render/devtools",
    "@json-render/solid",
  ],
});
