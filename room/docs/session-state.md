# Session state

A session is one existing run. The main chat SQLite database owns goal snapshots,
immutable turn attribution, runtime observations, tool metadata, and outcome
revisions. No parent session or reporting database is introduced.

Every successful task save appends a task revision. Preparation appends another
snapshot when it resolves the source to an immutable commit. Task revisions,
run configuration revisions, and outcome revisions have separate counters.

A/B turn acceptance and terminal state share the existing SQLite transaction.
Each attempt captures its run, role, binding, selected provider, full model ID,
effort, instruction and tool versions, configuration revision, current task
revision, workflow stage, trigger, and known peer or retry lineage. A repeated
turn request keeps its original attempt. Existing turns retain provable binding
attribution with `origin: migration-retained`; their historical timings and
usage remain unknown. Pre-run records with `legacy-v0` bindings recorded only
authors: their provider, exact model, effort, and configuration revision are
`null`, with `attributionSource: legacy-author-only`. Their binding ID, original
author, and instruction-version provenance remain available. Retained turns with
recorded bindings preserve their exact configuration and use
`attributionSource: recorded-binding`. Structured outcomes require candidates
with a recorded exact model; legacy author-only turns cannot supply that evidence.
Migration preserves only the currently
retained task snapshot and labels it `migration-current`.

Maestro text stays in its private database. Its required public attempt is
inserted before private acceptance or provider execution. Private terminal state
and a small metadata outbox commit together. Delivery updates the main attempt
before acknowledging the private entry. Startup drains this outbox before
interrupting unfinished Maestro attempts. Recovery never reruns providers or
tools. A terminal-delivery failure remains visible in Maestro and leaves the
outbox entry available for retry. A failed execution-start metadata write prevents
provider execution, fails the accepted turn, and releases the active seat so a
new submission can proceed once storage is available.

## Timings and usage

`requestedAt` is the server receipt time of an accepted submission, including
readiness checks and any peer-preemption wait. Peer turns use dispatch acceptance
time. `startedAt` means execution began, and `firstTextAt`
means the first visible text chunk. `finishedAt` records observed termination.
`elapsedMs` uses the local monotonic clock for runtime duration. Provider-reported
duration is separate in each usage observation. Crashed attempts and tools have
unknown end time and elapsed duration; restart detection time is not an end time.

Every usage observation declares its source, scope, coverage and completeness.
They are snapshots, not additive counters. Attempt `tokens` is the latest scoped
turn snapshot. Missing values are `null`; a reported zero remains zero. Thinking
is a subset of output. Token components retain provider-native semantics: Claude
`input_tokens` excludes its cache-read and cache-write inputs, while Codex
`inputTokens` includes its cached subset. Future reporting must normalize by
`source`; it cannot compare or sum every component blindly. Claude `totalTokens`
remains unknown. Tool metadata contains name, status and timing, without arguments,
outputs, errors or private prose.

Codex `thread/tokenUsage/updated.total` is a cumulative thread counter;
`last` covers only the latest model response. A fresh thread has a zero baseline.
Resumed turns subtract the pre-turn notification or the persisted continuation
baseline. Notifications from other provider turns are ignored. Duplicates do
not add tokens. Missing baselines or counter resets retain explicitly cumulative
observations and leave scoped turn totals unknown. `turn.completed.durationMs`
is stored separately from measured local elapsed time. These semantics were
verified with fresh and resumed provider turns containing multiple tool calls.

Claude result `usage` is per-turn main-loop usage and is captured before result
error checks. Thinking comes from `output_tokens_details.thinking_tokens`.
`modelUsage`, `total_cost_usd`, and `duration_api_ms` may include resumed history;
they remain explicitly cumulative observations. Per-turn model breakdown and
cost remain unknown without a reliable baseline. `duration_ms` is the
provider-reported invocation duration, including its loop; it is not API-only
time. Fresh and resumed SDK calls verified these distinctions.

## State and outcome APIs

- `GET /api/runs/:runId/state?after=0&limit=100` returns run metadata, the latest
  100 task snapshots, an attempt page with usage/tool facts, and outcomes. `after`
  is an attempt offset; `limit` accepts 1 through 500. `nextOffset` is null at the
  end. Attempt storage covers the whole run, independently of chat's last-100
  message view.
- `GET /api/runs/:runId/state/outcomes` returns the current task revision and
  criteria, latest proposal, latest confirmation, the latest 100 immutable
  outcome revisions, and `canConfirm`. Full history stays in SQLite.
- `POST /api/runs/:runId/state/outcomes/:proposalRevision/confirm` accepts
  `{ requestId, expectedRevision, decision }` and returns the outcome snapshot.

The authoritative JSON types and strict command schemas live in
`apps/api/src/state/state.contract.ts`. A decision contains `selection`,
`goalStatus`, `summary`, and `criteria`. Each criterion has its zero-based `index`,
`result`, and `evidence`; every current criterion must occur exactly once.

Maestro uses `get_session_state` to discover metadata and `propose_outcome` to
publish only its deliberately supplied structured decision. The service supplies
the actual source turn and captured evidence cursor. Both candidates must be
completed turns from the correct run and seats within that cursor. Their exact
model bindings and response SHA-256 hashes are retained automatically.

Confirmation requires the current task and proposal, the reviewed outcome
revision, and a successfully completed source Maestro attempt. A confirmed
proposal cannot be confirmed again with a new command. Sid may amend the decision
before explicit confirmation. An identical command retry returns its original
successful response before stale-state checks; conflicting reuse is rejected.
New proposals preserve previous confirmed decisions. Retained runs are read-only.

Shared state responses exclude private Maestro text, provider continuation IDs,
and private tool arguments or results. [Saved reports](reporting.md) read full history through a separate consistent
export reader. Optional run titles/categories/tags remain deferred.
