# Dashboard Example

AI-generated dashboard widgets with guardrails. Each widget is streamed from an LLM, constrained by a json-render catalog, and rendered with shadcn components and Recharts. Widgets can fetch and mutate data through named actions that hit a real REST API backed by Postgres.

## What it shows

- **Streaming widget generation** -- `useUIStream` streams JSONL patches from the server, progressively building each widget's spec.
- **Catalog-constrained actions** -- the catalog declares typed actions (`viewCustomers`, `createInvoice`, `approveExpense`, etc.) that map to REST endpoints; the registry wires them to real `fetch` calls with toast feedback.
- **Persistence** -- widget prompts and specs are saved to Postgres via Drizzle ORM, so widgets survive page reloads.
- **Drag-and-drop reorder** -- `@dnd-kit` lets you rearrange widgets, with ordering persisted to the database.
- **Edit mode** -- send a follow-up prompt to iteratively refine a saved widget.

## Setup

```bash
pnpm install          # from the monorepo root
cd examples/dashboard
cp .env.example .env
```

Set the required environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `AI_GATEWAY_API_KEY` | Yes | Vercel AI Gateway key |
| `AI_GATEWAY_MODEL` | No | Defaults to `anthropic/claude-haiku-4.5` |
| `KV_REST_API_URL` | No | Upstash Redis URL for rate limiting |
| `KV_REST_API_TOKEN` | No | Upstash Redis token |
| `RATE_LIMIT_PER_MINUTE` | No | Defaults to `10` |
| `RATE_LIMIT_PER_DAY` | No | Defaults to `100` |

Set up the database:

```bash
pnpm db:push          # apply the schema to your database
pnpm db:seed          # optional: populate with sample data
```

## Run

```bash
pnpm dev
# http://dashboard-demo.json-render.localhost:1355
```

Requires global [`portless`](https://github.com/vercel-labs/portless). The `predev` script checks for it automatically.

## Files

- `app/page.tsx` -- dashboard grid with drag-and-drop, widget management, and add/edit flows
- `app/api/generate/route.ts` -- streams text from the model using `dashboardCatalog.prompt()` as the system prompt
- `app/api/v1/` -- REST API for widgets, customers, invoices, expenses, accounts, and reports
- `lib/render/catalog.ts` -- component catalog with shadcn-based UI primitives and typed business actions
- `lib/render/registry.tsx` -- maps components to React (shadcn + Recharts) and wires actions to REST calls
- `lib/render/renderer.tsx` -- `DashboardRenderer` with state, visibility, and action providers
- `lib/db/schema.ts` -- Drizzle schema for customers, invoices, expenses, accounts, transactions, and widgets
- `components/widget.tsx` -- individual widget with `useUIStream`, auto-action execution, and save/edit logic
