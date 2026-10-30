# Build model-independent debate runs with Maestro

Add configurable A and B debate seats, separate workspaces and tools, and a private Maestro chat to lilbits.
Start Maestro with exactly `gpt-6.1-sol` at `high` effort.
Keep Maestro text-only for this increment, following Sid's October 30 clarification.
Keep the two lacquer panels as the main interface.
Deliver P1, P2, P3, P4, and P5 as reviewable units with evidence before advancing.

## How to read this

One box is one unit of work. Every box names the evidence that checks it.
Check a box only when its evidence exists, such as a file, a log, a screenshot, a test run, or a SHA.
The body is a how-to. The appendices explain the proposed architecture and record current evidence.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md` from the installed plugin.
The coordinator owns contracts, integration, topology, and verification.
Sid reviews and tests locally before any sync. Keep commits local. Sid handles PR submission and merges unless explicitly requested otherwise.
P1 through P5 are planning identifiers, not existing pull requests.
Use local branches and evidence folders until the owning repository and forge exist.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [x] Sid authorized execution on October 30, 2026. The instruction is recorded in the build standing orders.
- [ ] Write the standing orders with this plan path, the five units, the verification rule, Sid's merge authority, and the final demonstration predicate.
- [x] Sid established the repository at the original local checkout. Execution started from clean `d59c2c7` on `origin/main`. The existing chat database has a consistent backup under `room/.room/backups/`.
- [ ] Recheck installed dependencies and run the baseline checks from `room`. Record failures separately from regressions. Use `pnpm install --frozen-lockfile` only if the installed tree requires repair.
- [ ] Read the installed plugin's `skills/poteto-mode/playbooks/autopilot-stack.md`, its referenced execution rules, `skills/swarm/SKILL.md`, and `skills/poteto-mode/playbooks/opening-a-pr.md`.
- [ ] Read `room/AGENTS.md`, `room/CLAUDE.md`, `room/.agents/skills/scaffold-ui/SKILL.md`, `PRODUCT.md`, and `DESIGN.md`. Apply the TypeScript skill when changing TypeScript.
- [ ] Recheck provider login type, installed protocol versions, selected model and effort support, and the effective tool policy. Record metadata without credential contents.
- [ ] Use a decision trail at `.audit/maestro-build.tsv`. Record the choice, reason, source, and observed outcome.
- [ ] For an explicitly authorized unattended execution, arrange an hourly audit through the host's scheduling tool. Do not create an automation for this planning request. During attended execution, audit at each unit boundary.
- [ ] At each audit, inspect active worktrees and processes, dependency state, test evidence, and stale approvals. Send a status message only for a material change or a decision Sid needs to make.
- [ ] On a hold or stand-down, stop writers, cancel their owned tool processes, and preserve work and evidence.

### Spawn owners

- [ ] Give every implementation worker its own branch and checkout, a written scope, a fixed input contract, exact base SHA, verification commands, and a required evidence report.
- [ ] Assign the coordinator sole ownership of shared contracts, SQLite migrations, `app.module.ts`, `app.setup.ts`, package manifests, and lockfile changes. Other workers propose integration patches to that owner.
- [ ] Build P1 first. After its contracts stabilize, let P2's workspace worker and P3's Maestro worker prepare changes independently. P3 consumes P1's ledger and does not require P2's general tools.
- [ ] Review in the order P1, P2, P3, P4, P5. If all remain unmerged, the coordinator places P3 above P2 before verification, then places P4 and P5 above P3. Use the execution playbook for topology changes.
- [ ] Limit simultaneous workers to the host's capacity. With four available slots, keep one coordinator and at most three workers active. Run verification lanes in waves.
- [ ] Keep P2 workers within `apps/api/src/workspaces/**` and `apps/api/src/tools/**`. Keep P3 workers within `apps/api/src/maestro/**`, `apps/web/src/components/maestro-*/**` or corresponding single files, and `apps/web/src/hooks/use-maestro.ts`. The coordinator integrates shared entry points.
- [ ] Reserve one available worker for independent review or verification when a unit is ready. A builder does not count as that unit's independent reviewer.
- [ ] Stop P1, P3, P4, and P5 at the interaction review gate with screenshots and a short video. P2's tool behavior also requires a reviewable execution transcript.

### PR mechanics, for every PR

- [ ] Resolve the owning forge after the repository exists. Use its supported PR tool. Record local-only work as local units rather than inventing PR URLs.
- [ ] Prepare local commits and the verification handoff. Do not sync, push, or submit a PR before Sid tests locally and confirms. Sid owns PR submission unless explicitly requested otherwise.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` from `room` before the unit's final report. Record environmental blockers without claiming a pass.
- [ ] Run the installed `deslop` workflow before committing and `no-comments` workflow before review.
- [ ] Triage automated review comments against the source and behavior. Record accepted and rejected findings.
- [ ] Record the exact base and head SHA, configuration, provider versions, and tool-policy version for every verification report.

### Verdict and merge, for every PR

- [ ] Run one verification campaign at the code-ready head. Include a checks lane, the ten live scenarios below, a performance lane, and independent correctness and containment audits.
- [ ] Reuse a running application within one isolated verification checkout for sequential scenarios. Never run `pnpm dev` concurrently on fixed ports, because it clears existing listeners. Give genuinely parallel instances configured unique ports and matching origin rules.
- [ ] Use simulated provider streams for repeatable concurrency and recovery tests. Also perform the explicitly named live subscribed-provider checks. Never call simulation provider-parity evidence.
- [ ] Count a scenario as passed only when its requested artifact and predicate exist. Record rate limits, unavailable models, missing drivers, and interrupted checks as gaps.
- [ ] After a material behavior change, rerun affected checks and obtain a current independent verdict. Apply the execution playbook's exact-head and patch-id rules after topology changes.
- [ ] Hand verified units to Sid. Do not merge, publish, or discard participant outputs under this plan.

### Boot recipe, for every live lane

- [ ] Use an isolated checkout at the recorded head SHA. Compare the baseline against the recorded trunk SHA after establishing Git.
- [ ] Start the API and web app sequentially with `pnpm dev:text` on an available test instance. Wait for `GET /api/health`. Start speech only in the dedicated existing A/B audio scenario.
- [ ] Drive the browser through `agent-browser` or the available browser-control tool. Read the installed agent-browser skill before CLI use. Record the actual selected driver and commands in the evidence folder.
- [ ] For API-only scenarios, use loopback HTTP requests against the real server with its accepted Host and Origin. Capture requests, statuses, SSE events, and diagnostics. Save a browser screenshot of the resulting state or diagnostic report.
- [ ] Save screenshots under `/tmp/swarm-<unit>/worker-<lane>/<scenario>.png` and logs alongside them. Return absolute paths.
- [ ] Keep live model probes bounded. Start at most one turn per configured role at a time, use short prompts, and do not retry rate-limit failures indefinitely.
- [ ] Run repeatable performance probes with synthetic provider streams. Report provider wait time separately from application overhead.

## Separate role identity from model configuration (P1)

**Depends on.** None, after the baseline prerequisites.

**Files.**

- [ ] Edit `apps/api/src/chat/chat.types.ts`, `chat.store.ts`, `chat.service.ts`, `chat.controller.ts`, `runtimes.ts`, `codex.runtime.ts`, and `panelist-delivery.ts`.
- [ ] Create focused `apps/api/src/runs/` contracts, store, and controller modules and a provider capability registry.
- [ ] Edit `apps/web/src/lib/agents.ts`, `hooks/use-agents.ts`, `App.tsx`, `components/agent-panel.tsx`, and A/B identity presentation.
- [ ] Migrate A/B speaker identifiers in the existing speech implementation without adding Maestro as a speaker.
- [ ] Edit `PRODUCT.md` and `DESIGN.md` to record configurable seats and the in-app Maestro direction.

**Build.**

- [ ] Define stable participant roles `a`, `b`, and `maestro`. Keep the debate-seat collection exactly `a` and `b`.
- [ ] Store provider, exact model ID, supported effort, and display metadata separately. Keep A/B voices in seat-specific speech configuration. Maestro has no speech configuration.
- [ ] Preserve the current default assignments. A uses `gpt-6-luna` at high effort, B uses `claude-opus-5-5` at high effort, and Maestro uses `gpt-6.1-sol` at high effort.
- [ ] Discover model and effort options through the existing provider transports. Check the selected account route and initialization result. Keep requested and resolved IDs visible. Reject unavailable selections without silent fallback.
- [ ] Enforce the requested subscription-only mode. Do not accept API-key, cloud-provider, or paid API fallback as a substitute for the signed-in subscriptions.
- [ ] Create minimal run, configuration revision, participant binding, and sequenced correspondence records. Begin with an implicit ordinary-chat run so existing chat remains testable before setup UI exists.
- [ ] Bind sessions to run, role, provider, canonical model, workspace, instructions version, and tool-policy version. Start a fresh binding when those values change.
- [ ] Migrate existing Luna/Opus turns visibly within the current run using retained legacy bindings and original-author provenance. Archive the legacy continuations and start fresh bindings. Back up the database and test migration idempotence.
- [ ] Preserve completed-text forwarding, source-turn deduplication, human priority, inbox bounds, and restart-without-replay behavior. Add run scoping to idempotency keys and deliveries.
- [ ] Provide a monotonic correspondence sequence and replay cursor. Include human prompts, completed public replies, delivery and tool status, and artifact references. Keep partial stream updates replaceable by stable turn IDs.
- [ ] Apply current loopback and origin protection to every new run and model endpoint. The existing middleware only names agents and speech paths.

**You see.**

- [ ] Two panels retain their roles and histories when A/B providers are swapped. Model metadata changes without relabeling the role as a different participant.
- [ ] Same-model A/B conversations remain independent, and the UI still renders exactly two slabs.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Extend provider, store, service, peer-delivery, parser, and speech-queue cases for stable seats, model validation, legacy migration, run isolation, exact routing, and subscription-only failure. Run `pnpm test` and `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Send independent Both prompts and one explicit peer handoff on trunk and head. Save `p1-existing-chat.png`. Pass when both preserve exact forwarding and independent Both semantics.
- [ ] Lane 2. Swap A and B providers through the real run configuration API, then send short subscribed-provider prompts. Save `p1-swapped-models.png`. Pass when model provenance and role attribution match the reviewed selection.
- [ ] Lane 3. Put the same Codex model in both seats and continue each conversation. Save `p1-same-model.png`. Pass when continuation IDs, histories, and requests remain separate.
- [ ] Lane 4. Request an unsupported model or effort. Save `p1-no-fallback.png`. Pass when the run reports the exact selection as unavailable and starts no substitute.
- [ ] Lane 5. Load a copied legacy database twice. Save `p1-migration.png`. Pass when histories retain attribution and counts without duplicate migration records.
- [ ] Lane 6. Restart during a streamed test turn. Save `p1-restart.png`. Pass when the turn visibly fails and nothing replays automatically.
- [ ] Lane 7. Reconnect an SSE client from its last sequence. Save `p1-reconnect.png`. Pass when correspondence has no missing or duplicate committed entries.
- [ ] Lane 8. Retry a partially successful Both submission. Save `p1-both-retry.png`. Pass when only the unsent seat receives the retry.
- [ ] Lane 9. Probe new endpoints with disallowed origins and API-key-only test environments. Save `p1-boundaries.png`. Pass when origin checks and subscription-only readiness reject both cases.
- [ ] Lane 10. Use desktop and narrow layouts with swapped providers and existing A/B speech. Save `p1-labels-audio.png`. Pass when seats, provider marks, poses, and selected voices identify the correct participants.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure submission-to-first-visible-synthetic-token and snapshot response p95 with 1,000 retained public turns on both trunk and head.
- [ ] Probe. Capture 20 sequential samples per side, first the trunk baseline, then alternating trunk and head using identical fixed synthetic streams.
- [ ] Baseline. Save timings, machine details, payload size, and the actual trunk value before comparing.
- [ ] Rule. Fail an application-overhead regression greater than 100 ms at p95. Also fail a head snapshot response above 500 ms locally. These are proposed acceptance budgets, not current measurements.

**Review gate.** Sid reviews before merge.

- [ ] Post screenshots of same-model and swapped-provider A/B to the operator in chat.
- [ ] Post a 30 to 60 second video of model selection, independent histories, and preserved ordinary chat.
- [ ] Record the operator's review outcome and wait at merge-ready.

**Merge.**

- [ ] Record a clean independent verdict at the exact head and current base.
- [ ] Complete review-bot triage and the interaction review.
- [ ] Hand P1 to Sid with migration backup and recovery evidence. Sid owns the merge.

## Give each debate seat its own workspace and tools (P2)

**Depends on.** P1.

**Files.**

- [ ] Create `apps/api/src/workspaces/` for workspace lifecycle and `apps/api/src/tools/` for common tool schemas, executor, process ownership, and permission records.
- [ ] Extend P1 contracts and provider adapters through coordinator-owned integration patches.
- [ ] Extend API tests for lifecycle, containment, process cleanup, and artifact provenance. Update setup documentation.

**Build.**

- [ ] Accept a reviewed source repository and immutable base commit. Provision distinct branches and worktrees for A and B. Use separate scratch directories for tasks with no source repository.
- [ ] Never point both participants at the source checkout. Exclude uncommitted source changes unless the reviewed configuration explicitly captures them as shared grounding.
- [ ] Store control database, provider homes, authentication, logs, and orchestration state outside all participant tool roots. Migrate the current nested control state before exposing file reads.
- [ ] Implement durable states for provisioning, ready, running, interrupted, retained, and cleanup. Make create and retry idempotent. Preserve completed outputs when another seat's setup fails.
- [ ] Keep provider-native file and shell tools disabled initially. Offer the same application-owned file listing, reading, search, writing or patching, command execution, and artifact publication through Codex dynamic tools and Claude MCP.
- [ ] Give both seats the same effective capability profile by default. Record explicit differences rather than silently offering unequal tools.
- [ ] Canonicalize roots and reject path traversal, symlink escapes, control directories, sibling workspaces, and protected Git administrative paths. Prevent time-of-check changes from bypassing writes.
- [ ] Execute commands inside an enforced local OS sandbox through the broker. Provide only task-approved environment values, writable seat roots, bounded output, timeout, and owned process groups. Fail closed when the sandbox cannot start.
- [ ] Declare approved read-only toolchain and dependency-cache roots separately from writable seat roots. Prepare dependencies per workspace under the reviewed network policy. Do not inherit source-checkout secrets, mutable dependency links, or provider-home access.
- [ ] Prove the broker's execution boundary on both provider paths before advertising prototype support. The installed Codex protocol does not contain the restricted-read fields shown by newer online documentation.
- [ ] Provide task profiles for analysis and building. Start commands with restricted network access. Expose an optional bounded URL-fetch capability for supplied research URLs only after network behavior is verified. Treat full search or browser access as a separately tested capability.
- [ ] Give Maestro read access to published artifacts and correspondence. Reserve a separate scratch area for analysis when needed. Do not grant it write access to A/B worktrees.
- [ ] Register published artifacts immediately with run, role, producing turn, path, content hash, MIME type, base SHA, and creation sequence. Store a stable snapshot rather than a mutable path alone.
- [ ] Preserve worktrees and artifact snapshots after stop, failure, and restart. Require explicit user cleanup for unique work. Do not merge candidate branches automatically.
- [ ] Carry any ungranted capability as a visible denial or pending user request. Reject expired or wrong-run approval replies, and cancel pending requests when their turn stops.

**You see.**

- [ ] A and B write different drafts to the same relative filename without collisions. Each can run a bounded real prototype or analysis command.
- [ ] The source checkout, sibling workspaces, and room control state remain outside the participant's permitted tool access.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add behavior tests for provisioning retries, path boundaries, symlink handling, policy scoping, artifact snapshots, timeout, cancellation, and restart retention. Run `pnpm test` and `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the old workspace-list scenario on trunk and head. Record that trunk lacks file and command tools, then exercise head's scoped additions. Save `p2-workspace-regression.png`. Pass when listing works and added tools finish within their policy.
- [ ] Lane 2. Ask the subscribed Codex seat to read, edit, execute a tiny analysis, and publish its result. Save `p2-codex-tools.png`. Pass when its real tool receipts and artifact contents match.
- [ ] Lane 3. Repeat the same task through the subscribed Anthropic seat. Save `p2-claude-tools.png`. Pass when the same tool contract and result checks succeed.
- [ ] Lane 4. Write the same path concurrently in A/B using both adapters. Save `p2-collision.png`. Pass when each file contains its own output and the source stays unchanged.
- [ ] Lane 5. Attempt absolute, parent, sibling, and symlink reads and writes through file tools and commands. Save `p2-escapes.png`. Pass when every forbidden operation fails without a side effect.
- [ ] Lane 6. Attempt to read the control database, authentication home, environment secrets, and shared Git administrative files. Save `p2-control-denial.png`. Pass when both provider paths deny access.
- [ ] Lane 7. Start a child process, cancel its turn, and inspect owned process groups. Save `p2-process-cleanup.png`. Pass when no owned child survives and later turns still work.
- [ ] Lane 8. Interrupt provisioning after one seat exists and retry. Save `p2-provision-retry.png`. Pass when there is exactly one workspace per seat and existing output survives.
- [ ] Lane 9. Publish an artifact, then modify the original file and restart. Save `p2-artifact-retention.png`. Pass when the published snapshot and hash remain stable.
- [ ] Lane 10. Disable the sandbox or request a disallowed network destination. Save `p2-fail-closed.png`. Pass when tool execution refuses safely and reports the missing capability.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure existing workspace-list latency on both sides, plus head's worktree-provisioning time and bounded command duration without dependency installation.
- [ ] Probe. Use the same small repository, five cold provisioning samples, and 20 list calls. Alternate trunk and head list probes after recording trunk first.
- [ ] Baseline. Save trunk list p95 and mark worktree provisioning and command execution unavailable there. Do not compute a speed ratio for missing behavior.
- [ ] Rule. Fail an existing list regression above 100 ms p95, a cold two-seat setup above 10 seconds, or an unresponsive command cancellation above 2 seconds. Record provider inference separately.

**Review gate.** Review tool behavior before merge.

- [ ] Post containment receipts and an execution screenshot to the operator.
- [ ] Post a short video showing different A/B output at the same path and a rejected cross-workspace operation.
- [ ] Record the operator's review of the tool profile and remain merge-ready.

**Merge.**

- [ ] Record a clean independent correctness and containment verdict at the exact head.
- [ ] Complete review-bot triage and retain all workspace evidence.
- [ ] Hand P2 to Sid. Sid owns the merge.

## Add Maestro's private text chat and observer context (P3)

**Depends on.** P1 functionally. Verify on top of P2 in the final stack.

**Files.**

- [ ] Create `apps/api/src/maestro/` with private chat, context queries, and separately scoped events.
- [ ] Create `apps/web/src/components/maestro-dialog.tsx`, its styles, and `apps/web/src/hooks/use-maestro.ts`.
- [ ] Integrate the header trigger and split participant collections in `App.tsx`. Guard existing A/B speech readiness and interruption inputs.
- [ ] Extend local-origin protection, API tests, UI state tests, `PRODUCT.md`, and `DESIGN.md`.

**Build.**

- [ ] Keep the stable name Maestro while showing `gpt-6.1-sol` and `high` as configuration metadata. Use its own provider session and cancellation controller.
- [ ] Open a dedicated Radix dialog from a compact Maestro button. Reuse installed primitives, square geometry, reading typography, and existing theme tokens.
- [ ] Own chat state outside mounted dialog contents. Preserve drafts, history, connection, and active response when the dialog closes.
- [ ] Show human and Maestro messages in this chat. Preserve the current assistant-only treatment in A/B panels.
- [ ] Give Maestro access to complete run correspondence through paginated queries and a captured sequence boundary. Include human prompts and actual delivery outcomes, not only the last 100 visible replies.
- [ ] Make streamed public text inspectable as a partial turn revision. Capture both the committed-event boundary and partial revision IDs when analysis begins. Cite completed messages and artifacts by stable IDs.
- [ ] Record which sequence and partial revisions an answer covers. If A/B advance, show that new correspondence exists without cancelling or silently restarting Maestro's analysis.
- [ ] Update awareness records without launching an LLM turn for every event. On a user request, assemble bounded recent context and query older correspondence when needed.
- [ ] Keep Maestro's user chat private from A/B. Do not add Maestro to peer recipients, panel-pose controls, Both destinations, the peer scheduler, or A/B speech.
- [ ] Make ordinary Maestro chat, cancellation, failure, reconnection, and dialog dismissal independent of A/B turn and audio state.
- [ ] Keep this increment text-only. Do not add a voice ID, Cartesia configuration, speech queue, or read-aloud control for Maestro.

**You see.**

- [ ] A/B keep working while the user asks Maestro for a summary, disagreement analysis, evidence check, or next-step suggestion.
- [ ] Closing and reopening Maestro preserves the conversation and does not create a third slab.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Add cases for observer cursors, partial-turn revisions, private-message exclusion, separate stop scopes, one retained connection, and unchanged A/B speech inputs. Run `pnpm test` and `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Stream A/B concurrently on trunk and head. Record Maestro as absent on trunk. Open and chat with Maestro on head. Save `p3-concurrent-chat.png`. Pass when A/B retain their active turns and delivery state.
- [ ] Lane 2. Run one real Maestro turn on exactly `gpt-6.1-sol` at high effort. Save `p3-exact-model.png`. Pass when initialization and response provenance match and unavailable access never substitutes a model.
- [ ] Lane 3. Close and reopen the dialog during a response. Save `p3-close-reopen.png`. Pass when draft, history, stream, and single session persist.
- [ ] Lane 4. Cancel Maestro while both debate seats stream. Save `p3-cancel.png`. Pass when only Maestro's active turn stops.
- [ ] Lane 5. Disconnect Maestro's SSE connection. Save `p3-disconnect.png`. Pass when A/B stay usable and reconnect resumes the private chat without duplication.
- [ ] Lane 6. Ask Maestro about an earlier human prompt and forwarded response outside the visible reply window. Save `p3-full-context.png`. Pass when its cited records come from the correct run.
- [ ] Lane 7. Advance A/B while Maestro analyzes a captured boundary. Save `p3-analysis-boundary.png`. Pass when the answer states its covered point and newer events remain available.
- [ ] Lane 8. Type private setup notes to Maestro and inspect A/B provider inputs. Save `p3-private-chat.png`. Pass when no private note or unsolicited Maestro reply enters either seat.
- [ ] Lane 9. Drive Tab, Shift-Tab, Escape, focus return, narrow layout, and reduced motion. Save `p3-dialog-access.png`. Pass when focus is usable and background streaming continues.
- [ ] Lane 10. Play existing A/B speech while opening, asking, and cancelling Maestro. Save `p3-text-only-audio.png`. Pass when A/B audio continues and Maestro makes zero speech requests.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure A/B synthetic-token display lag and browser input responsiveness on trunk and head. Measure head's Maestro context assembly and dialog-open time separately.
- [ ] Probe. Replay identical A/B streams with 1,000 public turns. Alternate 20 trunk and head samples, with a Maestro query during head samples.
- [ ] Baseline. Save trunk display lag first and record Maestro actions as absent there.
- [ ] Rule. Fail added A/B display lag above 100 ms p95, context assembly above 500 ms p95, or dialog opening above 200 ms p95. Exclude model inference from context timing.

**Review gate.** Sid reviews before merge.

- [ ] Post desktop and narrow screenshots of Maestro alongside the two-panel room to the operator.
- [ ] Post a 30 to 60 second video of concurrent streams, dialog close and reopen, and Maestro-only cancellation.
- [ ] Record the operator's review outcome and remain merge-ready.

**Merge.**

- [ ] Record a clean independent verdict at the current head and base.
- [ ] Complete review-bot triage and confirm the text-only scope.
- [ ] Hand P3 to Sid. Sid owns the merge.

## Configure and run bounded debates through Maestro (P4)

**Depends on.** P2 and P3.

**Files.**

- [ ] Extend `apps/api/src/runs/` with versioned configuration, preparation, phase transitions, and scheduler behavior.
- [ ] Extend Maestro with structured configuration proposals and run inspection tools.
- [ ] Add setup review and run-status components inside the Maestro dialog. Keep compact phase metadata in the A/B room.
- [ ] Extend peer-delivery integration, origin checks, run tests, and product documentation.

**Build.**

- [ ] Ask for the task, intended result, shared references, and success criteria through Maestro. Produce a structured draft rather than relying on chat text as executable configuration.
- [ ] Present a review card with task mode, exact A/B models and efforts, source repository or scratch choice, source SHA, references, capability profile, round limit, and stop conditions.
- [ ] Track draft revisions with optimistic concurrency. Editing configuration invalidates previous readiness. Starting consumes the reviewed revision and an idempotency key.
- [ ] Check authentication, selected models, capabilities, workspace provisioning, and task inputs before declaring ready. Offer a bounded model-access check, and report its cost and result rather than treating catalog membership as entitlement.
- [ ] Freeze the effective configuration at start. Put model, workspace, and policy changes into a new run or explicitly prepared revision with fresh sessions.
- [ ] Offer reasoning and prototype task modes. Use the same task and shared grounding for both seats. Record intentional differences in role briefs.
- [ ] Enforce independent initial work in application code. Disable automatic peer delivery and all access to artifacts produced by the other seat during that phase, regardless of publication status. Open access only in an explicitly authorized comparison or exchange phase. Maestro retains observer access.
- [ ] Wait at a barrier until both required outputs complete. On failure or timeout, pause and show retry, stop, or explicitly continue with one candidate. Do not silently score an absent candidate.
- [ ] Offer comparison and bounded exchange after independent outputs exist. Preserve the current four-handoff default as an initial configurable cap and add explicit turn and time limits.
- [ ] Support pause at a safe turn boundary, immediate stop with process cancellation, and explicit resume. Preserve drafts and artifacts. Never replay a turn automatically after restart.
- [ ] Keep ordinary Both conversation available outside structured arena mode. Do not turn a free chat prompt into an autonomous multi-phase job.
- [ ] Keep phase control deterministic in the server. Maestro explains and proposes. User commands authorize starting, publishing instructions, or changing the phase.

**You see.**

- [ ] The user can describe a question to Maestro, inspect a concrete run configuration, and start A/B once.
- [ ] Both seats first work independently, then enter only the requested comparison or discussion steps.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Test revision conflicts, start deduplication, incomplete readiness, independent-phase delivery denial, barriers, limits, pause, stop, and interrupted-run recovery. Run `pnpm test` and `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run an ordinary Both conversation on both sides. Record structured setup as absent on trunk, then start a reviewed head run. Save `p4-start.png`. Pass when ordinary chat persists and the new run starts exactly once.
- [ ] Lane 2. Configure a reasoning task through Maestro and inspect the review card. Save `p4-review-config.png`. Pass when saved values match the displayed revision and provider selections.
- [ ] Lane 3. Edit a ready draft and submit its old revision. Save `p4-stale-revision.png`. Pass when readiness resets and the old start fails without a turn or extra workspace.
- [ ] Lane 4. Retry Start after a simulated lost HTTP response. Save `p4-start-retry.png`. Pass when one run, two seat workspaces, and one initial turn per seat exist.
- [ ] Lane 5. Let A finish and publish first while B still works. Try peer addressing and access to A's published and unpublished artifacts from B during independent work. Save `p4-independent.png`. Pass when the server rejects both and records the phase rule.
- [ ] Lane 6. Complete one candidate and fail the other. Save `p4-barrier.png`. Pass when the phase waits for an explicit recovery choice.
- [ ] Lane 7. Enter bounded exchange and exhaust the configured cap. Save `p4-limits.png`. Pass when no further automatic handoff starts.
- [ ] Lane 8. Pause, resume, and stop with an active command. Save `p4-controls.png`. Pass when each control has its stated scope and stopped commands leave no child process.
- [ ] Lane 9. Restart during a running phase. Save `p4-restart.png`. Pass when the run becomes interrupted, artifacts survive, and no automatic replay occurs.
- [ ] Lane 10. Change a next-run model while the current run continues. Save `p4-frozen-config.png`. Pass when current bindings stay unchanged and the next run gets fresh matching sessions.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure existing chat submission p95 on trunk and head. Measure head's draft-save, start acknowledgement, and ready-to-first-seat-dispatch overhead.
- [ ] Probe. Alternate 20 identical synthetic chat requests, then execute 20 starts against pre-provisioned tiny workspaces on head. Measure cold provisioning separately under P2.
- [ ] Baseline. Record trunk chat timings first. Mark reviewed setup as absent on trunk.
- [ ] Rule. Fail an existing chat overhead increase above 100 ms p95, a draft save or start acknowledgement above 500 ms p95, or dispatch overhead above 1 second after readiness.

**Review gate.** Sid reviews before merge.

- [ ] Post setup, independent-work, waiting-barrier, and stopped-run screenshots to the operator.
- [ ] Post a short video from task configuration through independent outputs and bounded comparison.
- [ ] Record the operator's review outcome and remain merge-ready.

**Merge.**

- [ ] Record a clean independent verdict at the exact head.
- [ ] Complete review-bot triage and the setup interaction review.
- [ ] Hand P4 to Sid. Sid owns the merge.

## Inspect artifacts and request synthesis or moderation (P5)

**Depends on.** P4.

**Files.**

- [ ] Add artifact inspection and export handlers to the run modules and isolated workspace support.
- [ ] Add artifact, comparison, and requested-action views within the Maestro dialog.
- [ ] Extend Maestro analysis tools, explicit publication commands, recovery tests, and the end-to-end verification harness.
- [ ] Update `readme.md`, `PRODUCT.md`, and `DESIGN.md` with the final supported behavior.

**Build.**

- [ ] List published A/B artifacts with provenance, hash, producing turn, source commit, and retained workspace. Show text and diff previews.
- [ ] Export or open artifacts safely. Serve executable prototype previews on an isolated origin with no room-command access. Do not execute candidate HTML or scripts inside the room's trusted origin.
- [ ] On request, ask Maestro to summarize agreement, compare evidence, score against reviewed criteria, explain unresolved disagreements, or recommend the next experiment.
- [ ] For prototype tasks, offer a requested base selection and synthesis proposal. Preserve the originals and write any approved synthesis into a separate workspace.
- [ ] Keep scoring and winner selection optional. A reasoning task can end with unresolved alternatives and cited evidence.
- [ ] Let the user ask Maestro to draft a question, publish an instruction to A, B, or both, or request a pause. Display the target and resulting action. Execute only an explicit requested action against the current run revision.
- [ ] Distinguish private analysis from published correspondence. Record the initiating user request, actor, target, source text or artifact, run revision, and resulting delivery.
- [ ] Require a deliberate user operation for integration into the source repository. Never auto-merge candidate code or delete unmerged worktrees.
- [ ] Complete recovery inspection for partially provisioned, interrupted, retained, and completed runs. Make explicit continuation choices visible without promising exact resumption of an interrupted external process.
- [ ] Run two end-to-end demonstrations. Use one reasoning disagreement task and one tiny competing-prototype task. Preserve recordings and all produced artifacts.

**You see.**

- [ ] The user can inspect both outputs, ask Maestro for a grounded comparison, and request a specific moderation action while A/B remain available.
- [ ] A completed or interrupted run retains reviewable history and outputs after restart.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Test artifact immutability, export and preview boundaries, stale action rejection, requested publication attribution, retained workspaces, and explicit recovery. Run `pnpm test` and `pnpm test:e2e`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Compare ordinary reply reading and Copy on both sides. Record artifact comparison as absent on trunk, then inspect a completed head run. Save `p5-inspection.png`. Pass when existing reading works and new artifacts match their hashes.
- [ ] Lane 2. Complete a real subscribed-provider prototype task with distinct A/B outputs. Save `p5-prototypes.png`. Pass when both outputs, execution receipts, and provenance remain inspectable.
- [ ] Lane 3. Ask Maestro for a comparison with message and artifact citations. Save `p5-comparison.png`. Pass when cited IDs and hashes resolve to the captured run.
- [ ] Lane 4. Ask for a reasoning synthesis with no winner. Save `p5-disagreement.png`. Pass when the UI preserves supported disagreements without forcing selection.
- [ ] Lane 5. Request one instruction to B through Maestro. Save `p5-publication.png`. Pass when only B receives the attributed, requested text once.
- [ ] Lane 6. Ask a private Maestro question during A/B activity. Save `p5-observe-only.png`. Pass when it creates no publication, phase change, or A/B interruption.
- [ ] Lane 7. Request synthesis into a separate workspace. Save `p5-synthesis.png`. Pass when original candidates and source stay unchanged.
- [ ] Lane 8. Open a prototype that attempts a room API request. Save `p5-preview-origin.png`. Pass when the preview cannot invoke room commands or read room state.
- [ ] Lane 9. Restart with completed and interrupted runs, then inspect and explicitly continue one. Save `p5-recovery.png`. Pass when outputs survive and only the selected continuation starts.
- [ ] Lane 10. Attempt cleanup with unique participant edits, then export the run. Save `p5-retention.png`. Pass when work remains until explicit cleanup and the export includes correspondence and artifact provenance.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure existing reply rendering and Copy latency on trunk and head. Measure head's artifact-list, bounded preview, and comparison-context assembly overhead.
- [ ] Probe. Alternate 20 reply interactions on both sides with the same retained history. On head, inspect 100 registered artifacts and preview a 1 MiB text artifact with bounded rendering.
- [ ] Baseline. Save trunk interaction p95 first. Record artifact inspection as absent there.
- [ ] Rule. Fail added existing-interaction lag above 100 ms p95 or artifact metadata and context requests above 500 ms p95. Fail an unbounded preview or UI stall above 1 second on the stated fixture.

**Review gate.** Sid reviews before merge.

- [ ] Post artifact, cited comparison, requested publication, and recovery screenshots to the operator.
- [ ] Post videos of the reasoning and competing-prototype demonstrations.
- [ ] Record the operator's review outcome and remain merge-ready.

**Merge.**

- [ ] Record a clean independent verdict at the exact head.
- [ ] Complete review-bot triage and final demonstrations.
- [ ] Hand P5 to Sid with retained outputs and the verification report. Sid owns the merge.

## Close the program

- [ ] Check each completed box only against its recorded evidence. Report any gap by unit and scenario.
- [ ] Hand Sid the reviewed branches or PRs, recordings, test results, tool-parity receipts, model provenance, and retained artifact locations.
- [ ] Report the final behavior and practical limitations. Confirm that Maestro is text-only and that ordinary Maestro interaction does not interrupt A/B.
- [ ] Leave unique work and participant workspaces intact. Record explicitly requested cleanup separately.

## Appendix A. Prototype evidence

Planning inspected the actual source on October 30, 2026. No application implementation or model inference ran.

A throwaway Git probe answered whether worktrees provide both independent edits and access isolation.
The probe created a new temporary repository, not a repository in this project.
Its baseline SHA is `48d142b996535dcb88adbcadfd432b106bc0d941`.
Its branches are `run/probe/a` and `run/probe/b`.
The source file stayed at "shared baseline" while A and B wrote different drafts to the same relative path.
A could still read B's file through a sibling path, and both worktrees shared the common Git directory.
This proves independent working copies. It does not prove sandbox containment.

The probe was rerun after the restart, and its result is saved inside the workspace.
The retained evidence is [the probe result](../../.audit/maestro-workspace-probe.json).
This is a behavioral probe, so its artifact is JSON rather than a screenshot.

Before the restart, the installed Codex CLI generated protocol types offline at `/tmp/maestro-codex-protocol`. Regenerate these temporary bindings during execution.
Its model shape includes supported reasoning efforts and its account shape distinguishes ChatGPT from API-key and Bedrock routes.
Its `SandboxPolicy` shape lacks the restricted-read controls shown in newer online documentation.
That version gap is why P2 uses one common broker and requires containment evidence rather than assuming provider parity.
The host is Darwin and `/usr/bin/sandbox-exec` exists. The broker itself has not been implemented or proven.

The focused API baseline command completed successfully:

`apps/api/node_modules/.bin/vitest run --root apps/api src/chat/chat.service.spec.ts src/chat/chat.store.spec.ts src/chat/peer-delivery.spec.ts src/chat/codex.runtime.spec.ts src/chat/runtimes.spec.ts`

It passed five files and 36 tests.
A direct Node run of web tests plus startup-readiness tests passed nine tests.
Two additional readiness tests could not bind a loopback listener because the current execution sandbox returned `EPERM`.
Those two checks are environmental gaps, not passing checks or demonstrated application regressions.
Full typecheck, lint, build, rendered UI, live provider access, tool containment, and model entitlement remain unverified in this planning task.

No visual prototype was needed to choose the requested modal direction.
P3's live review must establish its actual layout and concurrency behavior.
No prototype claims to prove that the current app already supports Maestro.

## Appendix B. Alternatives rejected

Adding C to the current two-agent array would render another full panel and involve C in A/B scheduling and stop behavior.
Keep panelist and orchestrator collections separate.

Renaming Luna to another model would retain session and identity coupling.
Make role, configured model, and continuation binding separate records.

Using worktrees as the permission boundary would permit sibling reads and shared Git mutations.
Use worktrees for edit independence and an enforced execution policy for tools.

Enabling unrestricted provider-native tools first would give the adapters different effective permissions.
Begin with a common broker through the transports already in the app.

Continuously invoking Maestro on streamed tokens would consume subscription quota and complicate cancellation.
Maintain correspondence and cursors in application code. Invoke Maestro on user requests.

A mandatory winner would fit some prototype comparisons but distort open reasoning tasks.
Make selection and synthesis requested operations.

An external orchestration framework would add another runtime and state system to a small local app.
Keep run control in the existing Nest backend, SQLite store, Codex app-server transport, and Claude SDK integration.

A Maestro voice adds no requirement needed for this iteration.
Keep C outside speech types and speech requests.

## Appendix C. Risks

P1 must establish Git ownership before worktrees or actual PRs can exist.
The source workspace may contain credentials and local runtime records, so baseline capture needs a deliberate exclusion list.

P1 model catalogs are selection aids. They are not proof that the signed-in account can complete the chosen turn.
Read provider initialization and actual request outcomes. Preserve exact requested-model failures.

P1 and P3 may share Codex subscription limits when A and Maestro both use Codex.
Bound concurrency, show rate limits, and preserve the run rather than silently switching providers or billing paths.

P2 must keep provider authentication outside model-operated file and command roots.
A common tool broker still needs a real execution sandbox. Path checks alone cannot contain arbitrary command execution.

P2's Git worktrees share repository metadata.
Deny participant mutation of worktree administration and destructive repository commands. Let the application own lifecycle operations.

P2 research network tools and prototype dependency installation may need additional network policy.
Document unavailable capabilities rather than claiming all research or build environments work.

P3's observer context must include correspondence outside UI snapshots.
The existing snapshot window is bounded and excludes human prompt bubbles.
Context compaction must preserve stable source IDs so older evidence remains retrievable.

P3 cannot cancel or disable existing A/B speech through shared readiness and interruption hooks.
Test that behavior even though Maestro has no voice.

P4 needs server-side phase and revision enforcement.
Prompt instructions alone cannot prevent early peer delivery or duplicate starts.

P5 executable artifacts must not share the trusted localhost room origin.
Otherwise candidate code could access the run-control APIs.

The browser driver and full rendered checks were not exercised during planning.
Resolve the available driver and test ports at execution start. Do not use the current fixed-port cleanup script in parallel verification instances.

Ten verification scenarios per unit do not mean ten simultaneous agents or ten expensive live model runs.
Use bounded waves and deterministic fixtures, with specific live calls for provider parity and final demonstrations.

All proposed timing budgets need a real baseline before enforcement.
They measure application overhead and the user-visible end state separately from variable provider inference.

## Appendix D. Links and reading list

The arena inspiration supplies framing, independent candidates, comparison, selection where useful, synthesis, and verification.
This plan keeps those ideas while making ordinary debate and requested analysis first-class modes.
The user reviews the task and success criteria. Optional judging notes can remain private to Maestro.
Read the [referenced arena skill](https://github.com/cursor/plugins/blob/main/pstack/skills/arena/SKILL.md) as inspiration.

The proposed records are run, configuration revision, role binding, provider session, correspondence event, tool operation, workspace, and artifact.
Use explicit state variants for draft, preparing, ready, running, paused, interrupted, completed, stopped, and failed states.
Do not build a general-purpose workflow engine for these records.

Current source entry points include:

- [Backend role and runtime types](../apps/api/src/chat/chat.types.ts) define the current two literal IDs.
- [Chat service](../apps/api/src/chat/chat.service.ts) owns the shared workspace, tool dispatch, peer scheduler, and stop behavior.
- [Chat store](../apps/api/src/chat/chat.store.ts) owns SQLite continuation and delivery records.
- [Codex transport](../apps/api/src/chat/codex.runtime.ts) and [Claude transport](../apps/api/src/chat/runtimes.ts) contain current model, auth, and tool constraints.
- [App composition](../apps/web/src/App.tsx) renders one full slab per current agent ID.
- [Client state](../apps/web/src/hooks/use-agents.ts) and [client parsing](../apps/web/src/lib/agents.ts) encode the two-agent assumptions.
- [Existing dialog](../apps/web/src/components/theme-controls.tsx) demonstrates installed Radix primitives.
- [Speech state](../apps/web/src/hooks/use-speech.ts) and [speech queue](../apps/web/src/lib/speech-queue.ts) show the existing A/B coupling to protect.
- [Application request protection](../apps/api/src/app.setup.ts) currently covers only agent and speech paths.

Official provider references support the integration direction:

- [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) describes model discovery, sessions, events, tools, and approvals. Check the installed protocol before using newer fields.
- [ChatGPT-plan catalog caveat](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) distinguishes a returned catalog from verified access.
- [Claude SDK subscription guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) currently says signed-in SDK usage draws from subscription limits.
- [Claude permission documentation](https://code.claude.com/docs/en/agent-sdk/permissions) describes tool availability, rules, and runtime decisions.
- [Claude execution isolation guidance](https://code.claude.com/docs/en/agent-sdk/secure-deployment) distinguishes tool permissions from enforced filesystem and process isolation.

Use the installed `how` workflow for P1 and P2 ownership tracing.
Use an independent adversarial review for P2 containment and P4 state transitions before accepting their verdicts.
Read the selected workflows before executing them.

Guard the Context Window shaped the three read-only exploration assignments.
Separate Before Serializing Shared State shaped distinct workspace and session ownership.
Sequence Work into Verifiable Units shaped the five delivery units.
Prove It Works shaped the live provider, cancellation, containment, and artifact checks.
Encode Lessons in Structure shaped use of the installed plan checker.

