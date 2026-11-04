import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "@json-render/core",
    "@json-render/core/store-utils",
    "@json-render/devtools",
    "@json-render/react",
    "react",
    "react-dom",
  ],
});
