# Luna dead-code investigation

The goal is to identify dead code in Arena and preserve evidence for a later cleanup decision. This audit changes no application code.

Two `gpt-6-luna` agents ran at high reasoning effort on October 31, 2026. Both inspected commit `5006bd1adbec53a60162c82eb41952dbb594d976`. Each read the same repository independently of the concurrent Opus reviewers. Codex reviewed their reports, reran the probes and targeted searches, and requested corrections where the evidence contradicted a conclusion.

## Swarm execution

The swarm used slice coverage. Workers read the source checkout and wrote to separate temporary artifact directories. Codex collected the completed Markdown reports here. Both workers completed; neither spawned additional agents.

| Worker | Scope | Result | Report |
| --- | --- | --- | --- |
| `luna_dead_api` | API, provider/runtime wiring, persistence, reporting, and associated tests | ISSUES. Two unused public declarations and two test-only helpers require classification before removal. | [API and reporting](api-reporting.md) |
| `luna_dead_web` | Web app, scripts, assets, root tooling, scaffolds, and retained examples | ISSUES. Two orphan source modules and one stale CSS selector group. | [Web and tooling](web-tooling.md) |

## Retained findings

These results describe repository-local reachability. Public exports and useful test helpers require a separate compatibility or test-design decision.

| Classification | Location | Finding |
| --- | --- | --- |
| Confirmed orphan module | `room/apps/web/src/components/ui/card.tsx:1` | No import reaches the Card components from `main.tsx`. The module exports its components through an export list. |
| Confirmed orphan module | `room/apps/web/src/lib/utils.ts:1` | The wrapper re-exports `cn`, while UI components import directly from package `cn`. No caller imports the wrapper. |
| Confirmed stale styles | `room/apps/web/src/index.css:745`, `:811`; `room/apps/web/src/arena.css:181` | `.voice-status` has no markup or class construction. The active speech status uses `.speech-feedback`. |
| Unused public declarations | `room/packages/reporting/src/contracts.ts:3`, `:195` | `SCHEMA_VERSION` and `ReportRun` have no consumers in this repository. The package barrel exports them, so this is not an automatic deletion recommendation. |
| Test-only helper | `room/apps/api/src/chat/runtimes.ts:208` | Only tests call `createRuntimes`; production calls `createParticipantRuntime` directly. |
| Test-only helper | `room/apps/api/src/reports/report.publisher.ts:73` | Only tests call `ReportPublisher.idle()` to wait for background work. Its absence from production callers does not make the test synchronization unnecessary. |

## Codex verification

Codex reran the web reachability probe and the API lexical probe preserved in the participant reports. The web probe printed:

```text
entry: main.tsx
reachable source modules: 45
unreachable TS/TSX modules:
components/ui/card.tsx
lib/utils.ts
lib/utils.ts module import edges: cn
components/ui/card.tsx module import edges: react, cn
```

The reachability count belongs to a regex-based local import graph, not a compiler graph or a runtime measurement. Its handling of import syntax is limited. Direct source inspection and the following searches support the retained findings. Run them from the repository root at the audited commit.

```sh
rg -n 'lib/utils|@/lib/utils|from.*card|ui/card' room/apps/web/src room/apps/web/test
rg -n 'voice-status|speech-feedback' room/apps/web/src
rg -n '\b(SCHEMA_VERSION|ReportRun|createRuntimes)\b' room --glob '!pnpm-lock.yaml' --glob '!render-assets.ts'
rg -n '\.idle\(|async idle' room/apps/api/src room/apps/api/test
```

The first search returned no matches, exit status 1. The CSS search returned three `.voice-status` rules and the live speech-feedback markup and stylesheet. The symbol search returned the two reporting declarations and `createRuntimes`' declaration plus two test references. The `idle` search returned its declaration and test callers, with no production caller.

The first web report incorrectly treated direct calls to package `cn` as proof that the local wrapper was used. It also missed the Card export list. Codex rejected that conclusion and returned the evidence to the same worker. The corrected report preserves this provenance. The initial broad no-dead-module conclusion is superseded by the orphan-module findings above.

## Coverage limits

The Luna analysis used static probes, text searches, and source inspection. It did not run the application, builds, or test suites. Identifier counts can miss unused members and cannot prove semantic reachability. Source-only graph checks cannot rule out consumers outside the checkout. No claim is made that these are all dead-code candidates.

Nest controllers, providers, dynamic reporting imports, fixture entrypoints, manual browser checks, and documented standalone examples were considered before classifying code as dead. Their retained purpose is documented in the participant reports. The separate [Opus investigation](../dead/README.md) records its own results and verification.
