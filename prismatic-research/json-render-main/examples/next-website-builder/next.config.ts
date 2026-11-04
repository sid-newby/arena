import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["next-website-builder-demo.json-render.localhost"],
  transpilePackages: [
    "@json-render/core",
    "@json-render/react",
    "@json-render/shadcn",
  ],
};

export default nextConfig;
