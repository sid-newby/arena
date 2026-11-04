# Stripe App API

A lightweight Next.js server that provides the `/api/generate` endpoint for AI-powered UI generation in the Stripe App examples.

## Setup

```bash
pnpm install

cp .env.example .env
# Set AI_GATEWAY_API_KEY
```

## Running

```bash
pnpm dev
```

Runs on port 3001. The Stripe apps (`drawer-app/` and `fullpage-app/`) expect this server to be running for AI generation features.

## API

### POST /api/generate

Accepts `{ prompt, systemPrompt }` and returns a streamed text response with a json-render spec.
