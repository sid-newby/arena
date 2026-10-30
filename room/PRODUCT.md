# arena

A personal localhost room where Sid talks directly with debate seats A and B. The two
large chat panels are the whole interface. Only agent replies appear in the
visible threads; human prompts still reach each selected agent and remain in
local history. A Both destination sends one prompt to each independently.

Use the supplied Vite/React/Nest pnpm workspace with Tailwind 4 and shadcn source
built on Radix. Preserve Oxc tooling, local API health, loopback binding, and
supply-chain policy. Development uses http://127.0.0.1:58241 with Nest on 58242.

## Confirmed direction

Sid selected thick, shiny black lacquer monoliths with square-cut edges and no
rounded corners. Dark Neo Tokyo typography, blue OpenAI identity and orange
Anthropic identity. Supplied marks live in assets/. Keep the approved lacquer
look as default. The later Cyberpunk/Edgerunners references inspire optional
future typography variants, not replacement of the current default.

Bundle tweakcn presets and fonts for immediate global color and typography
changes, with an import path for tweakcn exports. Material and zero-radius
construction persist. Display and conversation font controls are independent.

## Runtime

A defaults to gpt-6-luna at high effort through the signed-in Codex ChatGPT plan.
B defaults to claude-opus-5-5 at high effort through the local Claude Agent SDK
and existing sign-in. Either seat can use an available subscribed model from
either provider. Model and effort choices are validated against provider catalogs.
API-key and cloud-provider inference routes are unavailable in this setup.
Keep identities, sessions, and provider connections separate. No silent model
fallback. SQLite stores runs, immutable participant bindings, correspondence,
replies, prompts, and request IDs. Sessions belong to bindings, so changing a model
starts a fresh continuation while preserving visible history and original authors.
Restarted active turns fail visibly rather than replaying.

Each agent can control its own panel pose. Face the audience, face the other
model, or recenter. Agents own their panels. Manual pose controls are temporary suggestions; the next agent pose overrides them. Recenter helps an agent recover. Reduced-motion preferences affect rendering only. This increment
provides text conversation, bounded room tools, Cartesia speech, and explicit
panelist delivery. Prepared structured runs provide common contained file and command tools.
Agents can use web search and Context7 for research, and build commands have network access.
Permission UI and Scout attachment remain outside this increment. The independent Both destination still sends Sid's prompt to
each agent separately.

A model calls address_panelist with the other model's recipient ID before writing
its reply. The completed reply is the one text body for its panel, speech, and
peer input. Panelist messages wait when the recipient is busy. Human messages
interrupt active panelist replies and take priority. A human-rooted exchange has
at most four automatic handoffs. Stop conversation stops both replies and queued
deliveries; Stop audio only controls playback. Interrupted or queued deliveries
are reconciled visibly after restart without automatic replay. Facing the peer
changes orientation only and never sends a message.

Keep run control inside the existing application and provider transports. The
approved Maestro increment adds private text-only orchestration and analysis
without a third full-size panel or voice. Preview is explicitly authored
demonstration content, separate from live conversation.

## Reviewed debate runs

Maestro is a private text-only observer and setup assistant, initially configured
with Codex gpt-6.1-sol at high effort. Its correspondence context and private chat
are separate from A/B messages. Opening, closing, sending, or stopping Maestro
does not stop A/B work or change speech playback. Publication requires an explicit
user action on a reviewed proposal.

The Run tab reviews the question, success criteria, shared grounding, expected
artifact, subscribed seat models, source commit, tool profile, handoff limit, and
total time limit. Preparation gives A and B separate retained worktrees or scratch
directories and checks that contained tools can start. Preparation does not start
inference. Both independent outputs must finish before explicit comparison or
discussion. Pausing waits for an output boundary; Stop aborts active A/B work.
Interrupted work never replays automatically, and failed candidates require an
explicit retry selection.

Analysis tools read, list, search, and publish. Build tools additionally write,
patch, and run bounded commands. macOS containment restricts each seat to its own
writes, curated system reads, network access, and no provider credentials. Other
platforms fail closed. Published artifacts are immutable and retain seat, turn,
source revision, and content hash. HTML previews run in an opaque sandbox.
Maestro synthesis is a separate attributed prose artifact. It does not merge
candidate code or delete retained workspaces.

## Durable session state

One run is one session. Store each saved goal, resolved source snapshot, exact
model binding, attempt timing, available provider usage, tool metadata, and
structured outcome revision in the existing SQLite database. Unknown historical
metrics remain unknown. Maestro can propose a structured result for both
completed candidates; only Sid explicitly confirms it, with edits if needed.
Private analysis stays separate. Saved reports compare current, selected, or
date-selected runs using captured facts and immutable HTML/JSON generations.
Reports use fixed Black Lacquer and preserve readable tables offline. See
[session state](docs/session-state.md) and [reporting](docs/reporting.md) for
accounting, privacy, and recovery boundaries.
