# Opus dead-code investigation

The goal is to identify dead code in Arena and preserve evidence for a later cleanup decision. Dead code exists. This task produces reports and does not remove application code.

Two Claude Opus agents audited commit `5006bd1adbec53a60162c82eb41952dbb594d976` on October 31, 2026. Both used `claude-opus-5-5` with high effort. The audit snapshot is the messaging branch's source, rather than the older source on `main`. Report-only commits are integrated into local `main`; source paths and line numbers below refer to the audited commit.

## Swarm execution

The swarm used slice coverage. Each Opus worker had an isolated Git worktree and sole ownership of one report. Codex framed the assignment, launched both workers concurrently, checked their findings, and consolidated their reports. Probe source and outputs are embedded in the reports so removing the worktrees does not discard the evidence.

| Worker | Scope | Status | Report |
| --- | --- | --- | --- |
| Opus API, session `3a2c104c-ff7f-4725-bde3-b22718de7292` | API, providers, runtimes, workflow, persistence, tools, reporting, and associated tests | ISSUES. Unused private method, unused repository-local declarations and options, plus API and test-only candidates. | [API and reporting](api-reporting.md) |
| Opus web, session `d5898384-8a38-4670-ae18-757d68cce7bb` | Web app, hooks, styles, assets, scripts, tests, root tooling, scaffolds, and retained examples | ISSUES. Stale styles, write-only fields, an unused type member, orphan tests, and retained but unused primitives. | [Web and tooling](web-tooling.md) |

Both workers completed. No participant dropped out or was replaced. Additional candidate discovery stopped after the current findings were checked. Coverage limits remain explicit in each report. Two independent Luna high-effort agents produced a separate [Luna investigation](../dead-luna/README.md); Opus did not read their findings.

## Findings to review first

These are the clearest findings retained after Codex verification.

| Finding | Source at the audited commit | Evidence and implication |
| --- | --- | --- |
| Uncalled private polling method | `room/apps/api/src/debate/debate.service.ts:870` | `DebateService.poll` has no caller and produces `TS6133`. Its former interval caller was removed. `reconcile` and `deliverFeedback` remain used elsewhere. |
| Stale selectors | `room/apps/web/src/index.css:745`, `:749`, `:811`; `room/apps/web/src/arena.css:181` | `.voice-status` and `data-frozen` have no corresponding markup or setter. Dynamic class templates were checked. |
| Write-only lease fields | `room/apps/web/src/hooks/use-agents.ts:65`; `room/apps/web/src/hooks/use-maestro.ts:21` | The stored `generation` property is written but never read on both lease objects. The React state variable and effect dependencies remain live and must stay. |
| Unused local type member | `room/apps/web/src/lib/speech-queue.ts:11` | `SpeechReply.speechSummary` has no reads or writes. The separate wire/parser member in `agents.ts` has a different role. |
| Disconnected, stale tests | `room/tests/panel-expression.test.mjs:1`; `room/tests/panel-motion.test.mjs:64` | Configured runners omit this directory. Direct execution gives 15 passes and one failure because the test uses old seat IDs. Move and repair these tests rather than deleting them. |

## Candidates with a retained purpose or compatibility question

Absence of a production caller is useful evidence, but does not settle whether an interface or retained artifact should be deleted.

| Candidate | Verified fact | Classification for cleanup |
| --- | --- | --- |
| `SCHEMA_VERSION`, `ReportRun`, reporting `./fixtures` export | No repository consumer uses these exported declarations or the subpath. Fixtures themselves are used by tests and scale scripts. | Unused repository-local public declarations. Review package compatibility before removal. |
| `SeatMessageStore.finish`'s `error` option | The current caller supplies no error argument. | Check whether this is an omitted error propagation feature before deleting the option. |
| `RunStore.create`'s optional `id` | Current source and tests use generated IDs. | Unused option under current callers. A signature change still needs review. |
| `ChatStore.finish`'s terminal-status guard | Current callers supply terminal statuses. | A caller-dependent simplification candidate, not an unconditionally impossible branch. The guard also narrows the status type. |
| `'/api/maestro'` middleware prefix | No controller serves this prefix; current Maestro routes live under guarded `/api/runs`. | Stale configuration candidate. Removing middleware can still alter responses to obsolete URLs. |
| API routes without an in-repository client | The web uses a multiplexed stream and other routes, while some endpoints remain registered. | Live API contracts. Do not infer deadness from client searches or remove them solely on this audit. |
| `createRuntimes`, `ReportPublisher.idle`, test factories and accessors | Tests or tooling call them. | Useful test or tooling interfaces, with `createRuntimes` a possible wrapper simplification. |
| `components/ui/card.tsx`, `lib/utils.ts`, `tw-animate-css`, unused generated UI exports | Current production import/use graphs do not need them. Documentation, scaffold conventions, or generator configuration still name some of them. | Unused at runtime with an owner decision about retention. The active scaffold's Card is used and must not be conflated with the room copy. |
| Expression Lab CSS | Production includes stylesheet rules for a component that is development-only. | Move stylesheet loading with the development lab. Deleting the stylesheet globally would break that tool. |
| Scaffold `source.json` hash map | Seven hashes differ from current template files, and the runtime parser does not enforce this map. | Unenforced import provenance, not proof that historical metadata has no value. Clarify or regenerate it if current integrity is intended. |

These classifications govern the consolidated recommendation where a participant uses a broader word such as "dead" or "safe." No cleanup is automatically authorized by this report.

## Independent verification by Codex

Codex applied **Prove It Works** by extracting and rerunning the reports' probes and temporary-copy comparisons, rather than accepting worker summaries alone.

| Check | Observed result |
| --- | --- |
| API and reporting declaration graph | 64 files, 1,344 declarations, and 1,308 reachable declarations under the probe's production-root assumptions. The compiler reports the private `poll` method as unused. Graph counts are a static model, not runtime coverage. |
| Baseline versus modified API and reporting copies | Both package typechecks pass in both copies. All 137 selected tests pass in each copy, with zero test-status differences. This covers the report's deletion experiment, not every proposed candidate. |
| Web module graph | `card.tsx` and `lib/utils.ts` are outside both production and test import graphs. |
| Web member probe | Zero compiler diagnostics using TypeScript 6.0.3. It confirms zero reads for the lease fields and `SpeechReply.speechSummary`; serialized wire fields and dynamic accesses were triaged separately. |
| Web selector probe and source searches | Reproduced the stale selectors and distinguished generated `pose-`, `agent-`, `provider-`, and `screen-expression-` classes from unused selectors. |
| Web temporary-copy removal experiment | All four Vite builds pass. The web typecheck passes after the tested removals. The JavaScript bundle hash is unchanged; CSS output changes as recorded in the participant report. This does not prove visual equivalence. |
| Direct orphan-test run | 16 tests, 15 passed, 1 failed. `expressionMotion` throws because `cadence[agent]` is undefined for the old seat IDs. The equivalent checks pass with `a` and `b`. |
| Scaffold hash probe | 37 listed entries, 30 matching current files, 7 differing. This establishes drift, not the intent of the provenance record. |

The initial restricted API validation had two failures in both baseline and modified copies. A rerun with the access required for macOS containment checks passed all 137 tests. The report therefore records the completed rerun, while the orphan motion-test failure above remains unresolved and reproducible.

The independent API comparison command was:

```sh
bash /tmp/arena-dead-opus-verify-api/validate.sh /Users/sidnewby/Prog/arena/room /tmp/arena-dead-opus-verify-api/mutate.py
```

Those temporary filenames are disposable. The [API report's reproduction section](api-reporting.md#reproduce) embeds both scripts and extraction commands. The [web report's reproduction section](web-tooling.md#reproduce-this-report) embeds the module, member, selector, hash, seat-ID, documentation, and build probes. Run them against the audited commit with the corresponding installed dependencies.

## Gaps and repository handling

No browser or live-provider verification was performed. Full `task checks` was not run for this documentation-only task. Selected tests and build experiments validate specific hypotheses, and cannot establish that every removal is safe or that all dead code has been found. API clients outside the repository, reflection, serialization, historical metadata, and retained templates require judgment beyond a zero-reference search.

Only Markdown reports are integrated into local `main`. The messaging implementation at the audited commit is preserved on its existing branch. The two completed Opus audit worktrees and their merged branches are removed. Pre-existing messaging worktrees are retained. No remote synchronization is performed.
