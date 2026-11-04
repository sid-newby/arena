import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is reached through the portless proxy origin; Next 16
  // blocks cross-origin dev requests (and silently breaks hydration)
  // unless the origin is allowlisted.
  allowedDevOrigins: ["harness-chat-demo.json-render.localhost"],
  // The harness adapters ship sandbox bridge files they load at runtime via
  // new URL(..., import.meta.url); bundling breaks that resolution.
  serverExternalPackages: [
    "@ai-sdk/harness",
    "@ai-sdk/harness-claude-code",
    "@ai-sdk/harness-codex",
    "@ai-sdk/harness-pi",
    "@ai-sdk/sandbox-vercel",
    "@vercel/sandbox",
  ],
};

export default nextConfig;
