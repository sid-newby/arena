# Dead code audit: web, tooling and top-level areas

![status](https://img.shields.io/badge/status-ISSUES-orange)
![commit](https://img.shields.io/badge/commit-5006bd1-blue)
![mode](https://img.shields.io/badge/source%20changes-none-green)

| | |
|---|---|
| **Slice** | `room/apps/web`, `room/scripts`, `room/test`, `room/tests`, `room/assets`, root config and docs, `openai/`, `anthropic/`, `cartesia/`, `scaffolds/`, dotfiles |
| **Commit** | `5006bd1adbec53a60162c82eb41952dbb594d976` |
| **Status** | **ISSUES.** Dead code exists. One item is an active coverage gap. Nothing blocked the audit. |
| **Changes** | This report only. No source was modified, removed or committed. |

## Summary

The web application is in good shape. Its production import graph, hook returns and class
members are almost entirely live. Dead code is concentrated at the edges: two inherited scaffold
files, a few CSS rules, two write-only fields, one stale metadata block, and reference material.

**The most important result is not a deletion.** `room/tests/` holds the only tests for panel
expression and panel motion, and no runner executes them. One of them already fails.

| ID | Finding | Bucket | Confidence | Action |
|---|---|---|---|---|
| [WT-01](#wt-01) | `room/tests/*.test.mjs` never run; 1 of 16 fails | Orphaned tests | Verified | **Move and repair. Do not delete.** |
| [WT-02](#wt-02) | `.voice-status` rules | Dead | Verified | Remove |
| [WT-03](#wt-03) | `.room[data-frozen]` rule | Dead | Verified | Remove |
| [WT-04](#wt-04) | `generation` on two lease objects | Dead | Verified | Remove the field only |
| [WT-05](#wt-05) | `SpeechReply.speechSummary` type member | Dead | Verified | Remove |
| [WT-06](#wt-06) | `SpeechSegment.text` and the voice test string | Test-only | Verified | Decide, then simplify |
| [WT-07](#wt-07) | `source.json` `sha256` block, 7 of 37 stale | Dead metadata | Verified | Remove or regenerate |
| [WT-08](#wt-08) | Expression Lab CSS ships to production | Dev-only leak | Verified | Load with the lab |
| [WT-09](#wt-09) | `components/ui/card.tsx` | Unused, retained by docs | Verified unused | Owner decision |
| [WT-10](#wt-10) | `lib/utils.ts` | Unused, retained by docs | Verified unused | Owner decision |
| [WT-11](#wt-11) | `tw-animate-css` import and dependency | Unused, retained by docs | Verified unused | Owner decision |
| [WT-12](#wt-12) | 11 unused vendored UI exports | Unused generated surface | Verified unused | Keep unless trimming |
| [WT-13](#wt-13) | `dark:` variants that cannot activate | Inert generated code | Verified inert | Keep |
| [C-1 to C-8](#probable-candidates) | Flags, docs, marks, wire fields | Probable | Medium or low | Confirm with owner |

Removing WT-08, WT-09, WT-10 and WT-11 leaves the JavaScript bundle byte-identical and cuts
built CSS by **5,651 bytes**, from 102,803 to 97,152, or 5.5% before compression. See
[removal simulation](#removal-simulation).

## Classification

Keep these categories apart when acting on this report. Only the first is confirmed dead code.

| Category | Items | Meaning |
|---|---|---|
| **Confirmed dead** | WT-02, WT-03, WT-04, WT-05, WT-07 | No production, test or framework use found. Removal is safe after the listed validation |
| **Test-only** | WT-06 `SpeechSegment.text`, and the WT-01 suites | Used by tests, or tests of live code. Not removable as dead code. See below |
| **Dev-only** | WT-08 Expression Lab, `*.browser.mjs`, `agent-messaging.probe.mjs` | Live for developers. Only the Lab's CSS leak is a defect |
| **Unused, retained by convention** | WT-09 to WT-13 | Unreachable or inert, but documented or generated. Owner decision |
| **Public API contract** | C-5, C-7 | Wire fields. Not confirmed dead. See below |
| **Probable candidates** | C-1 to C-4, C-6, C-8 | Need an owner's answer |
| **Scaffold, example, reference** | [Intentionally retained](#intentionally-retained-scaffolds-examples-and-reference-material) | Not accidental production code |

### Public API routes and contracts

**This report classifies no public API route as dead.** Routes are owned by the API slice. Mentions here are caller
evidence only. From this slice, the web app and scripts call `/api/health`, `/api/runs`, `/api/runs/current`,
`/api/runs/scaffolds`, `/api/runs/repositories/browse`, `/api/runs/repositories/folders`, `/api/speech/status`,
`/api/speech/stream` and `/api/providers/`, some with further path segments. Run-scoped paths are built dynamically, so
this list is not a complete inventory and must not be used to infer that an unlisted route is unused.

Two items touch the public surface:

- **C-5 and C-7** are fields in API payloads. A web read count of zero does not make a field dead, because it remains
  part of the HTTP contract and other clients are possible.
- **WT-07** is not part of the contract. `GET /api/runs/scaffolds` returns parsed metadata, and the schema drops
  `sha256`, so removing the block does not change that response.

### Test-only helpers

| Item | Status |
|---|---|
| `SpeechSegment.text` (WT-06) | Test-only field in production code. Decide whether it is a seam worth keeping |
| `room/tests/*.test.mjs` (WT-01) | Tests for live code that no runner executes. Repair them |
| `room/test/scripts/agent-messaging.probe.mjs` | Documented manual probe. It uses `ChatService.forTest`, which the API slice owns. Keep |
| `room/apps/web/test/*.browser.mjs` | Documented manual browser harnesses. Keep |
| `room/test/scripts/wait-for-api.test.mjs` | Run by `pnpm test`. Live |

Web `lib/` has no export used only by tests.

## Scope and method

| Area | Tracked files | Result |
|---|---:|---|
| `room/apps/web` | 146 | Full graph, member, CSS, asset and dependency audit |
| `room/scripts`, `room/test`, `room/tests` | 9 | Every file traced to a runner or document |
| `room/assets` | 3 | Traced |
| `room/docs`, root docs, dotfiles, skills, config | 50+ | Consumers and links traced |
| `openai`, `anthropic`, `cartesia` | 9 | Traced; all intentional except where noted |
| `scaffolds` | 75 | Seed path traced. Template contents treated as product, not application code |

`room/apps/api` and `room/packages/reporting` belong to the other participant. They were read only
to confirm callers.

Each candidate passed through these checks, in order:

1. Entry points: `index.html` to `src/main.tsx`, `package.json` scripts, `Taskfile.yml`, Vite config,
   runtime file reads, and documented manual harnesses.
2. Module graph from `main.tsx`, separately from the test graph.
3. Type-aware reads of type members, hook returns and class members.
4. CSS selectors against `className`, `cn()` and `cva()` contexts, with dynamic templates listed by hand.
5. A fresh production bundle, then removal simulation on a throwaway copy.

The worktree has no `node_modules`. Analysis that needs dependencies used the main checkout, confirmed
to be the same commit and with identical web source:

```console
$ git -C /Users/sidnewby/Prog/arena rev-parse HEAD
5006bd1adbec53a60162c82eb41952dbb594d976
$ diff -rq room/apps/web/src /Users/sidnewby/Prog/arena/room/apps/web/src
[no output]
```

### Check outcomes

| Check | Outcome |
|---|---|
| `git status --short` in this worktree before writing this report | Clean |
| Files in the main checkout changed by these commands | None. `find -newer marker` empty |
| `oxlint -c .oxlintrc.json` from `room/`, version 1.89.0 | Exit 0, no output |
| TypeScript 6.0.3 program over `tsconfig.app.json`, including `noUnusedLocals` | 0 diagnostics |
| Vite production build, written only to scratch | Exit 0 |
| Web `tsc` after simulated removals | Exit 0 |
| `room/test/scripts/agent-messaging.probe.mjs` against local `dist` | All 4 checks `true` |
| Broken relative Markdown links in 42 non-upstream documents | 16, triaged in [Documentation links](#documentation-links) |

## Orphaned tests

<a id="wt-01"></a>
### WT-01: `room/tests/` is never executed

| | |
|---|---|
| **Paths** | `room/tests/panel-expression.test.mjs:1`, `room/tests/panel-motion.test.mjs:1` |
| **Symbols** | 16 tests over `ExpressionClock`, `ExpressionTimeline`, `parseExpression`, `ActivityTimeline`, `activityMotion`, `expressionMotion` |
| **Confidence** | Verified |

**Evidence.** Three runners exist and none reach this directory:

- `room/package.json:9` runs `node --test test/scripts/wait-for-api.test.mjs`.
- `room/apps/web/package.json` runs `node --test test/*.test.mjs` with `apps/web` as its directory.
- `room/apps/api` runs Vitest over its own package.

`room/scripts/check-test-layout.mjs:12` scans only `apps/api/src`, `apps/web/src` and `scripts`, so the
layout gate cannot notice the directory either. `README.md:144-150` and `room/AGENTS.md:17-18` omit it.

```console
$ git grep -n -E 'tests/panel|panel-(motion|expression)\.test' -- . ':!room/tests'
[exit 1]
$ git grep -l -E 'panel-(motion|expression)' -- room/apps/web/test room/test
[exit 1]
$ cd room && node --test tests/panel-expression.test.mjs tests/panel-motion.test.mjs 2>&1 | grep -E '^(ℹ (tests|pass|fail)|test at|✖ all)'
✖ all emotes settle at neutral and zero intensity produces neutral transforms (0.180667ms)
ℹ tests 16
ℹ pass 15
ℹ fail 1
test at tests/panel-motion.test.mjs:64:1
✖ all emotes settle at neutral and zero intensity produces neutral transforms (0.180667ms)
```

**Cause of the failure.** `room/tests/panel-motion.test.mjs:65` and `:74` still use the seat names
`luna` and `opus`. `room/apps/web/src/lib/panel-motion.ts:37-39` keys `cadence` by `a` and `b`, which
throws `Cannot destructure property 'direction' of 'cadence[agent]'`. Production is fine: the same
assertions pass with current ids, as [`seat-id-confirm.mjs`](#seat-id-confirmmjs) shows.

```console
$ node seat-id-confirm.mjs
PASS with current seat ids a/b
```

**Why nothing preserves it.** `node --test` with explicit paths has no auto-discovery here, and neither
file appears in a Task, script or document.

**Removal impact.** Deleting these files would remove the only coverage of expression timing and panel
motion. **Do not delete them.**

**Follow-up.** Move both files to `room/apps/web/test/`, change imports to `../src/lib/...`, replace
`luna`/`opus` with `a`/`b`, then run `task checks`. Add `tests` to the layout gate or remove the directory.

## Verified dead

<a id="wt-02"></a>
### WT-02: `.voice-status` rules

| | |
|---|---|
| **Paths** | `room/apps/web/src/index.css:745`, `room/apps/web/src/index.css:811`, `room/apps/web/src/arena.css:181` |
| **Symbol** | `.voice-status` |
| **Confidence** | Verified |

```console
$ git grep -n 'voice-status' -- room scaffolds
room/apps/web/src/arena.css:181:  .room-utility .voice-status {
room/apps/web/src/index.css:745:.voice-status {
room/apps/web/src/index.css:811:  .voice-status {
```

The class appears only in CSS. The built JavaScript contains no `voice-status`, while the built CSS still
ships all three rules.

**Why nothing preserves it.** The dynamic class templates in the app are `pose-`, `agent-`, `provider-` and
`screen-expression-`. None can produce this name, and no third-party UI component emits it.

**Removal impact.** None at runtime. Saves three rules.

**Follow-up.** Remove all three, keeping the surrounding `@media` blocks. Run the web build.

<a id="wt-03"></a>
### WT-03: `.room[data-frozen] .agent-slab`

| | |
|---|---|
| **Path** | `room/apps/web/src/index.css:749` |
| **Symbol** | `data-frozen` |
| **Confidence** | Verified |

```console
$ git grep -n -E 'data-frozen|dataset\.frozen' -- room scaffolds
room/apps/web/src/index.css:749:.room[data-frozen] .agent-slab {
```

**Why nothing preserves it.** `.room` is rendered once, at `room/apps/web/src/App.tsx:108`, without this
attribute, and no code sets `dataset.frozen`. The attribute is application-specific, so Radix cannot
supply it. `room/HANDOFF-panel-expression.md:11` rules out a Freeze mode.

**Removal impact.** None.

**Follow-up.** Remove the rule. Run the web build.

<a id="wt-04"></a>
### WT-04: Write-only `generation` lease fields

| | |
|---|---|
| **Paths** | `room/apps/web/src/hooks/use-agents.ts:65` and `:80`; `room/apps/web/src/hooks/use-maestro.ts:21` and `:58` |
| **Symbols** | `activeScope.current.generation`, `ConnectionLease.generation` |
| **Confidence** | Verified |

```console
$ git grep -n -w generation -- room/apps/web/src/hooks/use-agents.ts room/apps/web/src/hooks/use-maestro.ts
room/apps/web/src/hooks/use-agents.ts:58:  const [generation, setGeneration] = useState(0);
room/apps/web/src/hooks/use-agents.ts:65:    generation: number;
room/apps/web/src/hooks/use-agents.ts:80:        activeScope.current = { run, abort, generation };
room/apps/web/src/hooks/use-agents.ts:214:  }, [generation, update]);
room/apps/web/src/hooks/use-maestro.ts:21:type ConnectionLease = { id?: string; generation: number; controller: AbortController };
room/apps/web/src/hooks/use-maestro.ts:33:  const [generation, setGeneration] = useState(0);
room/apps/web/src/hooks/use-maestro.ts:58:    const lease: ConnectionLease = { generation, controller: new AbortController() };
room/apps/web/src/hooks/use-maestro.ts:117:  }, [providedRunId, generation, update]);
```

The field is stored but never read. **Keep the state variable.** `generation` remains a live effect
dependency at `use-agents.ts:214` and `use-maestro.ts:117`, and that is how reconnect works. Staleness is
decided by object identity on the lease and by `AbortController`, not by comparing this number.

**Why nothing preserves it.** Neither object is serialized or passed outside its hook. `member-reads.cjs`
reports `reads=0` for both.

**Removal impact.** None, provided only the field goes.

**Follow-up.** Remove the `generation` member from both types and from the initializers at `use-agents.ts:80`
and `use-maestro.ts:58`. Run `task checks`, then exercise Reconnect manually.

<a id="wt-05"></a>
### WT-05: `SpeechReply.speechSummary`

| | |
|---|---|
| **Path** | `room/apps/web/src/lib/speech-queue.ts:11` |
| **Symbol** | `SpeechReply.speechSummary` |
| **Confidence** | Verified |

```console
$ git grep -n speechSummary -- room/apps/web
room/apps/web/src/lib/agents.ts:76:  speechSummary?: string;
room/apps/web/src/lib/agents.ts:222:        (message.speechSummary === undefined || typeof message.speechSummary === 'string') &&
room/apps/web/src/lib/speech-queue.ts:11:  speechSummary?: string;
```

`SpeechTracker` speaks `reply.narration.segments` and never touches this member. The type has no runtime
effect. The related `Reply.speechSummary` in `agents.ts` is candidate [C-5](#probable-candidates), because the
parser validates it.

**Removal impact.** Compile-time only.

**Follow-up.** Remove the line. Run typecheck.

## Test-only production field

Not confirmed dead: tests depend on it.

<a id="wt-06"></a>
### WT-06: `SpeechSegment.text` is read only by tests

| | |
|---|---|
| **Paths** | `room/apps/web/src/lib/speech-queue.ts:17`, `:87`; `room/apps/web/src/hooks/use-speech.ts:223` |
| **Symbols** | `SpeechSegment.text`, voice test string |
| **Confidence** | Verified |

`src/` writes this field twice and reads it nowhere. The request body at `speech-queue.ts:181-192` sends
`agent`, `kind`, `runId`, `replyId`, `revision`, `segment` and `requestId`, but not `text`.

```console
$ rg -n "\.text\b" room/apps/web/src/lib/speech-queue.ts room/apps/web/src/hooks/use-speech.ts
room/apps/web/src/lib/speech-queue.ts:62:      this.seen.set(`${agent}:${reply.id}`, { text: reply.text, blocked: true });
room/apps/web/src/lib/speech-queue.ts:72:      if (!reply.text.startsWith(state.text) || ['stopped', 'failed'].includes(reply.status)) {
room/apps/web/src/lib/speech-queue.ts:76:      state.text = reply.text;
$ git grep -n "s\.text\|segment\.text" -- room/apps/web
room/apps/web/test/speech-queue.test.mjs:31:    tracker.collect('a', [reply('new', 'A fresh reply. Another')]).map((s) => s.text),
room/apps/web/test/speech-queue.test.mjs:36:    tracker.collect('a', [reply('new', 'A fresh reply. Another', 'completed')]).map((s) => s.text),
room/apps/web/test/speech-queue.test.mjs:80:    tracker.collect('a', [full]).map((segment) => segment.text),
room/apps/web/test/speech-queue.test.mjs:121:  assert.equal(segments.map((segment) => segment.text).join(' '), summary);
room/apps/web/test/speech-queue.test.mjs:144:  assert.ok(long.every((s) => s.text.length <= 350));
```

The lines matching `.text` in `src/` belong to `reply` and tracker state, not to `SpeechSegment`.

The voice test string at `use-speech.ts:223` is also unused. The server builds its own wording at
`room/apps/api/src/speech/speech.service.ts:253`:

```ts
text = `Hello, this is ${String(body.agent).toUpperCase()} speaking.`;
```

**Why nothing preserves it.** The field never leaves the browser, and the object is not serialized whole.

**Removal impact.** Production is unaffected, but `speech-queue.test.mjs` asserts segment splitting through
this field. Those tests would need to read `revision`/`segment` or narration instead.

**Follow-up.** Decide whether the field is a test seam worth keeping. If it is, remove only the literal at
`use-speech.ts:223` by making `text` optional. If it is not, remove the field and rewrite the assertions.

## Verified dead metadata

<a id="wt-07"></a>
### WT-07: `source.json` `sha256` block

| | |
|---|---|
| **Path** | `scaffolds/react-nest/source.json:6` |
| **Symbol** | `sha256` map, 37 entries |
| **Confidence** | Verified |

`metadataSchema` at `room/apps/api/src/scaffolds/scaffold-discovery.controller.ts:8-16` declares `id`,
`importedOn`, `sourceRepository` and `sourceCommit`. `sha256` is absent, so it is discarded on parse. Real
integrity comes from `templateDigest` in `room/apps/api/src/scaffolds/scaffold-seed.ts`. Every `sha256` hit in
application code belongs to other artifact metadata (`debate.service.ts:944`, `workspace-manager.ts:571`) or
to reporting.

[`scaffold-hashes.cjs`](#scaffold-hashescjs) shows the block has already drifted:

```console
$ node scaffold-hashes.cjs
{
  listed: 37,
  ok: 30,
  stale: [
    'DIFF .oxfmtrc.jsonc',
    'DIFF .oxlintrc.json',
    'DIFF apps/web/package.json',
    'DIFF apps/web/src/index.css',
    'DIFF pnpm-lock.yaml',
    'DIFF pnpm-workspace.yaml',
    'DIFF readme.md'
  ]
}
```

It also covers 37 of the 72 tracked template files. Those seven differences may be deliberate edits after
import; the point is that the block looks like an integrity record, and nothing enforces it.

**Removal impact.** None. `source.json` sits outside `template/`, so `templateDigest` does not change.

**Follow-up.** Delete the block, or keep it as import provenance with a note saying it is not enforced.
Run the scaffold unit tests in `room/apps/api/test/unit/scaffolds/`.

## Dev-only leak

The feature is live in development. Only its production CSS is dead.

<a id="wt-08"></a>
### WT-08: Expression Lab CSS in the production bundle

| | |
|---|---|
| **Path** | `room/apps/web/src/components/expression-lab.tsx:10` |
| **Symbol** | `import './expression-lab.css'` |
| **Confidence** | Verified |

The lab itself is **live and intentional**. `room/apps/web/src/App.tsx:293` renders it when
`import.meta.env.DEV` is true and the URL has `?effects`. The bundler removes that branch from production, but
the CSS import is a side effect and survives.

| Token | In built JS | In built CSS |
|---|---|---|
| `ExpressionLab` | No | No |
| `expression-lab` | No | Yes, 11 rules, 968 bytes |

**Why nothing preserves it.** No production JavaScript can render these classes.

**Removal impact.** Removing only the CSS import saves 991 bytes but would break the dev lab, so it needs moving,
not deleting.

**Follow-up.** Load the component with a `React.lazy` dynamic import behind the `import.meta.env.DEV` check, then
confirm the classes are gone from the build and `?effects` still works under `pnpm dev`.

## Verified unused, retained by convention

These are unreachable, but a document or generator convention names them. Deleting them is safe for the
running app and is still the owner's decision.

<a id="wt-09"></a>
### WT-09: `components/ui/card.tsx`

| | |
|---|---|
| **Path** | `room/apps/web/src/components/ui/card.tsx:1` (102 lines) |
| **Symbols** | `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent` |
| **Confidence** | Verified unused. Retention intent: medium |

```console
$ git grep -n -E 'lib/utils|ui/card' -- room/apps/web/src room/apps/web/test
[exit 1]
$ cmp room/apps/web/src/components/ui/card.tsx scaffolds/react-nest/template/apps/web/src/components/ui/card.tsx && echo IDENTICAL
IDENTICAL
```

[`module-graph.cjs`](#module-graphcjs) reports it `[UNREACHED]` from both production and test entries. It is
byte-identical to the scaffold copy, where `template/apps/web/src/App.tsx:10` does use it. The room inherited it.

**Why nothing preserves it.** There is no dynamic import, glob import or lazy route in `src/`. However,
`room/DESIGN.md:233` calls it an "installed generic Card", and `room/.agents/skills/scaffold-ui/SKILL.md:21-22`
tells agents it exists.

**Removal impact.** No JavaScript change. Tailwind scans the file regardless, so it adds CSS to every build.
Together with WT-10, removal saves 2,956 bytes of CSS. Update `DESIGN.md:233` and the room's copy of the skill.

**Follow-up.** Choose one: delete it and update both documents, or keep it as an agent-facing primitive.

<a id="wt-10"></a>
### WT-10: `lib/utils.ts`

| | |
|---|---|
| **Path** | `room/apps/web/src/lib/utils.ts:1` |
| **Symbol** | re-export of `cn` |
| **Confidence** | Verified unused. Retention intent: medium |

Every UI component imports `cn` directly from the `cn` package. See the `git grep` in WT-09, which also covers
`lib/utils`, and `cmp` reports this file identical to the template.

**Why nothing preserves it.** `room/apps/web/components.json:17` aliases `utils` here, but that file configures
the shadcn CLI, and `room/AGENTS.md:21` says the CLI is not installed. `scaffold-ui/SKILL.md:24` documents the
re-export for agents.

**Removal impact.** None at runtime. Would need updates to the skill row and `components.json` alias if the CLI
returns.

**Follow-up.** Remove with WT-09 or keep both as a matched scaffold pair.

<a id="wt-11"></a>
### WT-11: `tw-animate-css`

| | |
|---|---|
| **Paths** | `room/apps/web/src/index.css:2`, `room/apps/web/package.json:25` |
| **Symbol** | `@import 'tw-animate-css'`, dependency `tw-animate-css` |
| **Confidence** | Verified unused today. Retention intent: medium |

```console
$ rg -n '\b(animate-(in|out)|fade-(in|out)|slide-(in|out)|zoom-(in|out)|spin-(in|out))\b' room/apps/web/src --glob '!tweakcn-presets.json'
[exit 1]
$ git grep -n -E 'className=\{[^}]*phase' -- room/apps/web/src
[exit 1]
```

No source uses its utilities. Removal in the simulation changed no JavaScript and removed 1,704 CSS bytes: the
`@property`/`--tw-enter-*`/`--tw-exit-*` scaffolding, plus `.paused` and `.running`. Those two utilities exist only
because Tailwind matched words in non-class strings such as the phase name at `run-workflow.ts:35` and `let running`.
They are not applied as classes.

**Why nothing preserves it.** Radix primitives here do not add animation classes themselves, and the project's
motion uses its own CSS and Web Animations. `room/.agents/skills/scaffold-ui/SKILL.md:27` does name it as an existing import.

**Removal impact.** Future generated shadcn components that use `animate-in` would need it restored. Removal needs
a lockfile update through `pnpm remove`, which this audit did not perform.

**Follow-up.** Decide with WT-09. Run `task checks` after removal and visually check dialogs.

<a id="wt-12"></a>
### WT-12: Unused vendored UI exports

| | |
|---|---|
| **Confidence** | Verified unused. Keep by default |

| Path | Symbols |
|---|---|
| `room/apps/web/src/components/ui/bubble.tsx:6`, `:104` | `BubbleGroup`, `BubbleReactions` |
| `room/apps/web/src/components/ui/input-group.tsx:105`, `:117` | `InputGroupText`, `InputGroupInput` |
| `room/apps/web/src/components/ui/message.tsx:4`, `:32`, `:58`, `:71` | `MessageGroup`, `MessageAvatar`, `MessageHeader`, `MessageFooter` |
| `room/apps/web/src/components/ui/message-scroller.tsx:126-128` | `useMessageScroller`, `useMessageScrollerScrollable`, `useMessageScrollerVisibility` |

`module-graph.cjs` shows each has no importer and no use beyond its definition and export list. Their functions
are tree-shaken: `bubble-group`, `bubble-reactions`, `message-group`, `message-avatar` and `input-group-text` are
all absent from built JavaScript.

`room/.oxlintrc.json` ignores `apps/web/src/components/ui/**`, and `room/AGENTS.md:21` calls these generated
components local source. Keeping upstream shape makes future comparison easier. `buttonVariants` also lacks an
external importer, but `Button` uses it, so that is only an unnecessary `export`.

**Removal impact.** None at runtime. A small amount of Tailwind CSS would disappear; that was not measured.

**Follow-up.** No action unless the team decides to trim generated code.

<a id="wt-13"></a>
### WT-13: Inert `dark:` variants

| | |
|---|---|
| **Paths** | `room/apps/web/src/index.css:6`, 13 lines across `room/apps/web/src/components/ui/` |
| **Symbol** | `@custom-variant dark`, `dark:*` utilities |
| **Confidence** | Verified inert. Keep |

The variant requires an ancestor with class `dark`. The room has no such element, and its theme system writes CSS
variables and `data-theme` instead (`room/apps/web/src/themes/theme.ts`).

```console
$ rg -n "classList|\.dark\b" room/apps/web/src room/apps/web/index.html
room/apps/web/src/index.css:6:@custom-variant dark (&:is(.dark *));
room/apps/web/src/themes/theme.ts:41:    if (!data.cssVars?.dark) throw new Error('Registry JSON must include cssVars.dark.');
room/apps/web/src/themes/theme.ts:42:    tokens = validTokens({ ...data.cssVars.theme, ...data.cssVars.dark });
room/apps/web/src/themes/theme.ts:44:    const block = source.match(/\.dark\s*\{([^}]+)\}/)?.[1];
room/apps/web/src/themes/theme.ts:45:    if (!block) throw new Error('Paste the full tweakcn CSS export, including its .dark block.');
```

`theme.ts` only parses pasted tweakcn `.dark` data; it never adds a `dark` class. The variants sit in generated components, so editing them would
increase upstream drift for little gain.

**Follow-up.** None.

## Probable candidates

Each needs an owner's answer or evidence this audit cannot get from the repository.

| ID | Path | Symbol | Confidence | Evidence and uncertainty | Before removal |
|---|---|---|---|---|---|
| C-1 | `room/scripts/start-with-cartesia.mjs:9` | `--check` flag | Medium | Only the definition matches `git grep -F -e '--check'`; the other hits are `oxfmt --check`. An operator may run it by hand as a credentials check | Ask the owner |
| C-2 | `scaffolds/react-nest/chat-interface/` | `design-chat.md`, `shadcn-chat.md` | Medium | Discovery reads only `source.json` and `template/`, and `git grep` finds no references. `design-chat.md` is a Sociotechnic brief; its links to `../../sociotechnic/` and `../references/` are broken | Confirm nobody needs the brief. Removal does not alter `templateDigest` |
| C-3 | `scaffolds/react-nest/template/ON-HOLD.md` | Seeded file | Medium | No inbound references. A "Luna, Opus, and Scout room" handoff that `prepare` copies into **every** new scaffold workspace. Outside the `sha256` list | Removal changes `templateDigest`, so a selection holding the old digest gets "The selected scaffold changed." Existing seeds are unaffected |
| C-4 | `room/HANDOFF-panel-expression.md` | Document | Medium | No inbound references. Says it "does not implement the effects", but they now exist in `lib/panel-expression.ts` and `hooks/use-panel-motion.ts`. Its design rationale may still have value | Move useful rationale to `DESIGN.md` |
| C-5 | `room/apps/web/src/lib/agents.ts:76`, `:222` | `Reply.speechSummary` | Medium | Parser validates it; nothing consumes it. The API still sends it (`chat.store.ts:745`). Removing the validation relaxes a malformed-input rejection | Coordinate with the API owner |
| C-6 | `room/assets/claude.svg` | Brand mark | Low | No references. `room/assets/anthropic.svg` and `openai.svg` are identical to `apps/web/public/assets/`, which is what the app loads. `room/PRODUCT.md:16` says supplied marks live here, so these look like source assets | Keep unless the owner disagrees |
| C-7 | `room/apps/web/src/lib/agents.ts:12,16,29,69,71-73,87,94`; `lib/maestro.ts:8`; `lib/outcomes.ts:14-31`; `lib/run-workflow.ts:403`; `hooks/use-agents.ts:63` | Wire-shape type members | Low | Zero reads, but they describe API payloads and have no runtime cost. Deleting documentation of the contract gains little | Keep |
| C-8 | `room/scripts/start-with-cartesia.mjs:65-66` | `LUNA_`/`OPUS_CARTESIA_VOICE_ID` fallbacks | Low | Undocumented aliases, mirrored at `speech.service.ts:30,34`. Use depends on private environment files, which were deliberately not read | Ask the owner. API half is in the other slice |

The `member-reads.cjs` output also contained false positives, which were read individually and rejected:

| Item | Why it is live |
|---|---|
| `lib/maestro.ts:104` `requestId`, `turnId` | Sent whole through `JSON.stringify(target)` at `hooks/use-maestro.ts:217` |
| `lib/panel-expression.ts:14` `expiresAt` | Read through narrowed `value.expiresAt` at `:73-84`, and carried on cue objects |
| `lib/reports.ts:31` `kind` | Discriminant used by `Extract<ReportSelection, { kind: 'date-range' }>` |
| `lib/maestro.ts:12` `runId`, `lib/outcomes.ts:31` `runId` | Compared through narrowed `value.runId` in their parsers |

## Intentionally retained: scaffolds, examples and reference material

**This is not accidental dead production code.** Nothing in the application imports it, by design.

| Path | Role | Evidence | Verdict |
|---|---|---|---|
| `scaffolds/react-nest/template/` | Product input | `discoverScaffolds` and `prepareScaffoldSeed` copy it to new workspaces; `run-setup` lists it through `/api/runs/scaffolds` | **Live.** Unused-looking code here is shipped to users |
| `openai/luna.ts`, `README.md`, `package.json` | Standalone Codex terminal client | Outside `pnpm-workspace.yaml` packages. Only references are in `ON-HOLD.md:61,151`, which calls it "a reference for the earlier Codex client" | Retained example |
| `anthropic/AGENTS/builder-agent/` | Platform agent quickstart | Only references are `ON-HOLD.md:66,152`: "reference material… not a running local adapter". Outside `.claude/agents` | Retained example |
| `cartesia/code.md`, `websockets.md` | Provider reference notes | No references | Retained reference |
| `cartesia/.env.example` | Live template | `room/scripts/start-with-cartesia.mjs:61` reads the resulting `cartesia/.env` | **Live** |
| `room/docs/ui-standards/upstream/` | Vendored UI guides | Named by `scaffold-ui`, oxlint and oxfmt ignores. `diff -rq` against the scaffold copy reports no differences | Retained, with notices |
| `room/apps/web/src/vendor/shadcn-tailwind.css` | Pinned vendor file | SHA-256 `4c371f7a…` matches `THIRD_PARTY_NOTICES.md` | Retained, not audited rule by rule |
| `room/apps/web/components.json` | shadcn configuration | CLI is not installed, per `room/AGENTS.md:21` | Retained |

`openai/` and `anthropic/` are unused by the room. Removing them affects nothing at runtime, but the only record
of their purpose is `ON-HOLD.md`, so removing C-3 first would erase that context.

## Rejected hypotheses

| Hypothesis | Result |
|---|---|
| Dynamic CSS such as `.pose-a`, `.agent-b`, `.screen-expression-grumpy`, `.provider-codex` is dead | **Live.** Produced by template classes at `App.tsx` and `agent-panel.tsx`. Values match `a`/`b`, the mood list and `ProviderId` |
| `--color-*` and `--radius-*` properties are dead because no `var()` reads them | **Live.** `@theme inline` feeds Tailwind utilities |
| Bundled fonts are partly unused | **Live.** All 31 `.ttf` files appear in `fonts.css`. All 27 families match `fonts.json` and the picker. 27 license files |
| The "42 presets" copy is stale | Accurate. `tweakcn-presets.json` holds 42 |
| Web `lib/` has test-only exports | None. Every export the tests use also has production use |
| Class members or hook returns are dead | None of 43 class members or 60 hook-return properties. All have reads |
| Unused optional props exist | Rejected. Candidates were `{...room}` spread at `App.tsx:177` or inline local types |
| A web dependency is unused, besides WT-11 | Rejected. All appear in the production graph, or in Vite, tsconfig, or CSS |
| `room/scripts/*` contains dead scripts | Rejected. All 5 are reached from `room/package.json` or `Taskfile.yml` |
| `Taskfile.yml` targets are stale | Rejected. Every path exists, including `packages/reporting/scripts/*` |
| `*.browser.mjs` files are orphaned | Rejected. Documented manual harnesses at `room/docs/cartesia-tts.md:25` and `room/DESIGN.md:288` |
| `agent-messaging.probe.mjs` is stale | Rejected. Documented at `room/docs/agent-interruption-rnd.md:132` and passes |
| `room/skills/panel-presence/SKILL.md` is unreferenced | **Live.** Read at runtime by `room/apps/api/src/chat/panel-presence.ts:19` |
| `room/docs/reporting-cdn-proof.json` is unused | **Live.** Consumed by `packages/reporting/scripts/build-assets.mjs` |
| `ExpressionLab` is dead because it is gated | **Live** in development through `?effects`. Only its CSS leaks (WT-08) |

## Documentation links

None of these break a build. They are recorded so nobody reads them as code findings.

| Links | Count | Assessment |
|---|---:|---|
| `scaffolds/react-nest/chat-interface/shadcn-chat.md` to `/docs/...` | 9 | Site-relative links from pasted upstream docs |
| `scaffolds/react-nest/chat-interface/design-chat.md` | 2 | Foreign project paths, see C-2 |
| `room/.agents/skills/cartesia-api/SKILL.md:9,81,126` | 3 | Sibling `cartesia-line` skill is not installed |
| `room/docs/maestro-debate-plan.md:432` | 1 | Points to the ignored `.audit/` directory |
| `room/docs/model-response-plan.md:50` | 1 | Points to a generated, gitignored file |

`room/docs/agent-interruption-rnd.md`, `cartesia-tts.md` and `maestro-wizard-workspaces-plan.md` have no inbound
filename references. They were kept out of the findings because they are design records, and `cartesia-tts.md` is the
only document for the speech browser harness.

## Removal simulation

The simulation ran on a throwaway copy using [`removal-sim.sh`](#removal-simsh). Steps are cumulative.

```text
baseline                 exit=0 css=102803 js=875847 jssha=eafeede21d
no-tw-animate            exit=0 css=101099 js=875847 jssha=eafeede21d
plus-no-card-utils       exit=0 css=98143 js=875847 jssha=eafeede21d
tsc after removals exit=0
plus-no-lab-css-import   exit=0 css=97152 js=875847 jssha=eafeede21d
```

The last step shows the size of the leak. A real fix must preserve the lab in development.

## Limitations

- **No browser verification.** Visual results of removing WT-02, WT-03 and WT-11 were inferred from selectors and
  the build. `*.browser.mjs` harnesses were not run.
- **The narration task was not run.** `task narration:eval` calls subscribed models, which this audit may not do.
  Its imports were checked to exist in source.
- **`dist` may lag.** The messaging probe used the main checkout's existing `apps/api/dist`.
- **TypeScript differs.** Language-service probes use 6.0.3, available under `apps/api`. The web package pins a
  newer version; its own `tsc` was used for the simulation's typecheck, which passed. Language-service compatibility
  with the web version was not tested.
- **CSS scope.** The selector probe proves class and `data-*` presence, not that a compound selector ever matches.
  It skips `vendor/` and `fonts.css`. Individual `index.css` tokens, such as `--sidebar*`, were not judged dead: they
  belong to the shadcn and tweakcn token contract, and `theme.ts` accepts them.
- **Regex portability.** macOS `git grep -E` does not support `\b`, which gave a false empty result during this audit.
  Commands that need word boundaries use `rg`, and those results were re-run before being quoted.
- **Discovery was stopped on request** once current findings were checked. This report is not proof that no other dead
  code exists in the slice.
- **Text search limits.** Zero-reference results for documents and assets show no in-repository consumer. They cannot
  rule out a human or external tool, which is why those items are candidates.
- **Template contents were not audited for internal dead code.** The template is seeded output.
- **Private files were not read**, including `cartesia/.env`.

## Reproduce this report

Everything needed is here; no scratchpad is required. Run from the repository root at the audited commit, with a
checkout that has dependencies installed, then save each block below under the given filename outside the repository.

```bash
export INSTALLED=/path/to/installed/checkout/room
export TS_LIB="$INSTALLED/apps/api/node_modules/typescript"
export WEB_ROOT="$INSTALLED/apps/web"
export OUT="$(mktemp -d)"

node module-graph.cjs
node member-reads.cjs
node css-selectors.cjs
node scaffold-hashes.cjs
node seat-id-confirm.mjs
node doc-links.mjs
INSTALLED="$INSTALLED" OUT="$OUT" bash removal-sim.sh

(cd "$INSTALLED/apps/web" && ./node_modules/.bin/vite build --configLoader runner --outDir "$OUT/bundle" --emptyOutDir --logLevel error)
for t in ExpressionLab expression-lab voice-status data-frozen bubble-group message-group; do
  printf '%-16s js=%s css=%s\n' "$t" "$(grep -c -F "$t" "$OUT"/bundle/assets/*.js)" "$(grep -c -F "$t" "$OUT"/bundle/assets/*.css)"
done
(cd room && "$INSTALLED/node_modules/.bin/oxlint" -c .oxlintrc.json; echo "oxlint exit $?")
(cd "$INSTALLED" && node test/scripts/agent-messaging.probe.mjs)
```

`member-reads.cjs` resolves types from `WEB_ROOT`. The other probes read this checkout. The `vite build` and
messaging probe run from `INSTALLED`, which should therefore be at the same commit. The build writes only to
`--outDir`, and `--configLoader runner` avoids temporary config files.

### `module-graph.cjs`

Separates production and test reachability, and lists exports no other production module imports.

```js
// Usage (repo root): TS_LIB=<typescript dir> node module-graph.cjs
const ts = require(process.env.TS_LIB);
const fs = require('fs'), path = require('path');
const root = path.resolve('room/apps/web'), src = path.join(root, 'src');
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : o.push(p); } return o; };
const all = walk(src).filter((f) => /\.(tsx?|css|json)$/.test(f));
const tests = [...walk(path.join(root, 'test')), ...walk(path.resolve('room/tests'))].filter((f) => f.endsWith('.mjs'));
function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(src, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return { ext: spec };
  const noJs = base.replace(/\.js$/, '');
  for (const c of [base, base + '.ts', base + '.tsx', base + '.css', base + '.json', noJs + '.ts'])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: c };
  return { missing: spec };
}
const cache = {};
function parse(f) {
  if (cache[f]) return cache[f];
  const text = fs.readFileSync(f, 'utf8');
  const m = (cache[f] = { imports: [], exports: [] });
  if (f.endsWith('.json')) return m;
  if (f.endsWith('.css')) {
    for (const x of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)) m.imports.push({ spec: x[1], names: ['*'] });
    return m;
  }
  const kind = f.endsWith('x') ? ts.ScriptKind.TSX : f.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind);
  (function visit(n) {
    if (ts.isImportDeclaration(n)) {
      const c = n.importClause, names = [];
      if (!c) names.push('#side');
      else {
        if (c.name) names.push('default');
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) names.push('*');
          else for (const e of c.namedBindings.elements) names.push((e.propertyName || e.name).text);
        }
      }
      m.imports.push({ spec: n.moduleSpecifier.text, names });
    }
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const e of n.exportClause.elements) m.exports.push(e.name.text);
      if (n.moduleSpecifier) m.imports.push({ spec: n.moduleSpecifier.text, names: n.exportClause.elements.map((e) => (e.propertyName || e.name).text) });
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(n.arguments[0]))
      m.imports.push({ spec: n.arguments[0].text, names: ['*'] });
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    if (mods?.some((x) => x.kind === ts.SyntaxKind.ExportKeyword)) {
      if (mods.some((x) => x.kind === ts.SyntaxKind.DefaultKeyword)) m.exports.push('default');
      else if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) m.exports.push(d.name.getText());
      else if (n.name) m.exports.push(n.name.text);
    }
    ts.forEachChild(n, visit);
  })(sf);
  return m;
}
function graph(entries) {
  const seen = new Set(), queue = [...entries], used = {}, ext = new Set();
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const i of parse(f).imports) {
      const r = resolve(f, i.spec);
      if (r.ext) ext.add(r.ext);
      if (r.missing) console.log('UNRESOLVED', path.relative('.', f), i.spec);
      if (r.file) { (used[r.file] ??= new Set()); i.names.forEach((n) => used[r.file].add(n)); queue.push(r.file); }
    }
  }
  return { seen, used, ext };
}
const prod = graph([path.join(src, 'main.tsx')]);
const test = graph(tests);
console.log('## src files outside the production graph');
for (const f of all) if (!prod.seen.has(f)) console.log(path.relative('.', f), test.seen.has(f) ? '[test-reachable]' : '[UNREACHED]');
console.log('## exports no other production module imports');
for (const f of all) {
  if (!prod.seen.has(f) || !/\.tsx?$/.test(f)) continue;
  const u = prod.used[f] ?? new Set(), t = test.used[f] ?? new Set(), text = fs.readFileSync(f, 'utf8');
  if (u.has('*')) continue;
  for (const e of new Set(parse(f).exports)) {
    if (u.has(e)) continue;
    const self = e === 'default' ? 0 : [...text.matchAll(new RegExp(`\\b${e}\\b`, 'g'))].length - 1;
    console.log(path.relative('.', f), e, `tests=${t.has(e) || t.has('*')}`, `otherMentionsInFile=${self}`);
  }
}
console.log('## production externals', [...prod.ext].sort().join(' '));
```

### `member-reads.cjs`

Uses the TypeScript language service to count reads and writes of members, hook returns and class members.

```js
// Usage (repo root): TS_LIB=<typescript dir> WEB_ROOT=<apps/web with node_modules> node member-reads.cjs
// Reports type members and hook-return properties with no read, and class members with no external use.
const ts = require(process.env.TS_LIB);
const path = require('path'), fs = require('fs');
const web = path.resolve(process.env.WEB_ROOT ?? 'room/apps/web');
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(`${web}/tsconfig.app.json`, ts.sys.readFile).config, ts.sys, web);
const options = { ...cfg.options, noEmit: true, incremental: false, composite: false, tsBuildInfoFile: undefined };
const ls = ts.createLanguageService({
  getScriptFileNames: () => cfg.fileNames,
  getScriptVersion: () => '1',
  getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined),
  getCurrentDirectory: () => web,
  getCompilationSettings: () => options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories, realpath: ts.sys.realpath,
});
const program = ls.getProgram();
console.log('diagnostics', ts.getPreEmitDiagnostics(program).length, 'typescript', ts.version);
const tokenAt = (sf, pos) => { let r = sf; const go = (n) => { if (pos >= n.getStart(sf) && pos < n.getEnd()) { r = n; ts.forEachChild(n, go); } }; ts.forEachChild(sf, go); return r; };
const out = [];
for (const sf of program.getSourceFiles()) {
  if (!sf.fileName.startsWith(`${web}/src/`) || sf.fileName.includes('/components/ui/')) continue;
  const check = (name, kind) => {
    let reads = 0, writes = 0;
    const seen = new Set(), start = name.getStart();
    for (const group of ls.findReferences(sf.fileName, start) ?? []) for (const e of group.references) {
      const key = `${e.fileName}:${e.textSpan.start}`;
      if (seen.has(key) || (e.fileName === sf.fileName && e.textSpan.start === start)) continue;
      seen.add(key);
      const rsf = program.getSourceFile(e.fileName), tok = tokenAt(rsf, e.textSpan.start), p = tok.parent;
      if (ts.isPropertySignature(p) && p.name === tok) continue;
      const written = (ts.isJsxAttribute(p) && p.name === tok) || (ts.isPropertyAssignment(p) && p.name === tok) ||
        (ts.isShorthandPropertyAssignment(p) && p.name === tok) ||
        (p.parent && ts.isBinaryExpression(p.parent) && p.parent.left === p && p.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken);
      written ? writes++ : reads++;
    }
    out.push({ at: `${path.relative(web, sf.fileName)}:${sf.getLineAndCharacterOfPosition(start).line + 1}`, name: name.getText(), kind, reads, writes });
  };
  (function visit(n) {
    if ((ts.isPropertySignature(n) || ts.isMethodSignature(n)) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) check(n.name, 'member');
    if (ts.isReturnStatement(n) && n.expression && /\/hooks\//.test(sf.fileName)) {
      let x = n.expression;
      while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x)) x = x.expression;
      if (ts.isObjectLiteralExpression(x)) for (const p of x.properties) if (p.name && ts.isIdentifier(p.name)) check(p.name, 'hook-return');
    }
    if (ts.isClassDeclaration(n)) for (const m of n.members) if (m.name && !ts.isConstructorDeclaration(m)) check(m.name, 'class-member');
    ts.forEachChild(n, visit);
  })(sf);
}
const count = (k) => out.filter((o) => o.kind === k).length;
console.log('scanned', { member: count('member'), hookReturn: count('hook-return'), classMember: count('class-member') });
for (const o of out) if (o.reads === 0) console.log(`${o.at} ${o.name} [${o.kind}] reads=0 writes=${o.writes}`);
```

### `css-selectors.cjs`

Compares CSS classes and `data-*` selectors with class-bearing source contexts, and lists dynamic class templates.

```js
// Usage (repo root): TS_LIB=<typescript dir> node css-selectors.cjs
const ts = require(process.env.TS_LIB);
const fs = require('fs'), path = require('path');
const root = 'room/apps/web/src';
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : o.push(p); } return o; };
const files = walk(root);
const cls = new Set(), data = new Set(), dynamic = new Set();
for (const f of files.filter((f) => /\.tsx?$/.test(f))) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const collect = (n) => {
    if (ts.isStringLiteralLike(n)) n.text.split(/\s+/).forEach((t) => t && cls.add(t));
    if (ts.isTemplateExpression(n)) {
      [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].forEach((x) => x.split(/\s+/).forEach((t) => t && cls.add(t)));
      if (/[a-z]-$/.test(n.head.text)) dynamic.add(`${f}: ${n.getText().replace(/\s+/g, ' ')}`);
    }
    ts.forEachChild(n, collect);
  };
  (function visit(n) {
    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      if (/className$/i.test(name) && n.initializer) collect(n.initializer);
      if (name.startsWith('data-')) data.add(name);
    }
    if (ts.isCallExpression(n) && /^(cn|cva)$/.test(n.expression.getText())) n.arguments.forEach(collect);
    if (ts.isPropertyAssignment(n) && /className/i.test(n.name.getText())) collect(n.initializer);
    if (ts.isVariableDeclaration(n) && /class/i.test(n.name.getText()) && n.initializer) collect(n.initializer);
    if (ts.isStringLiteralLike(n) && n.text.startsWith('data-')) data.add(n.text);
    ts.forEachChild(n, visit);
  })(sf);
}
const classes = new Map(), attrs = new Map();
for (const f of files.filter((f) => f.endsWith('.css') && !f.includes('/vendor/') && !f.endsWith('fonts.css'))) {
  const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of text.matchAll(/([^{}]+)\{/g)) {
    if (/^\s*@(?!media|supports|container|layer)/.test(m[1])) continue;
    const at = `${f}:${text.slice(0, m.index + m[1].search(/\S/)).split('\n').length}`;
    for (const c of m[1].matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) if (!classes.has(c[1])) classes.set(c[1], at);
    for (const c of m[1].matchAll(/\[(data-[\w-]+)/g)) if (!attrs.has(c[1])) attrs.set(c[1], at);
  }
}
console.log('css classes', classes.size);
console.log('## classes absent from className/cn/cva contexts');
for (const [c, at] of classes) if (!cls.has(c)) console.log(at, `.${c}`);
console.log('## data attributes selected in CSS, never set in source');
for (const [c, at] of attrs) if (!data.has(c)) console.log(at, c);
console.log('## dynamic class templates');
for (const t of [...dynamic].sort()) console.log(t);
```

### `scaffold-hashes.cjs`

```js
// Usage (repo root): node scaffold-hashes.cjs
const fs = require('fs'), crypto = require('crypto');
const { sha256 } = JSON.parse(fs.readFileSync('scaffolds/react-nest/source.json', 'utf8'));
const stale = [];
let ok = 0;
for (const [file, expected] of Object.entries(sha256)) {
  const full = `scaffolds/react-nest/template/${file}`;
  if (!fs.existsSync(full)) { stale.push(`MISSING ${file}`); continue; }
  crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') === expected ? ok++ : stale.push(`DIFF ${file}`);
}
console.log({ listed: Object.keys(sha256).length, ok, stale });
```

### `seat-id-confirm.mjs`

The failing test's assertions with current seat ids.

```js
// Usage (repo root): node seat-id-confirm.mjs
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const { activityMotion, expressionMotion } = await import(resolve('room/apps/web/src/lib/panel-motion.ts'));
for (const agent of ['a', 'b'])
  for (const mood of ['annoyed', 'grumpy', 'amused', 'skeptical', 'startled']) {
    const keyframes = expressionMotion(mood, 1, agent);
    assert.deepEqual(keyframes.at(-1), { transform: keyframes[0].transform, offset: 1 });
    for (const keyframe of expressionMotion(mood, 0, agent))
      assert.doesNotMatch(keyframe.transform, /(?:\(|\s)-?[1-9]/);
  }
assert.ok(activityMotion('settle', 'b').duration > activityMotion('settle', 'a').duration);
console.log('PASS with current seat ids a/b');
```

### `doc-links.mjs`

```js
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
const md = execSync("git ls-files '*.md'").toString().trim().split('\n').filter((f) => !f.includes('/upstream/'));
for (const f of md) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/\]\(([^)\s]+)\)/g)) {
    const u = m[1].split('#')[0];
    if (!u || /^(https?:|mailto:|<)/.test(u)) continue;
    const p = normalize(join(dirname(f), u));
    if (!existsSync(p)) console.log(`BROKEN ${f}:${t.slice(0, m.index).split('\n').length} -> ${m[1]}`);
  }
}
console.log('checked', md.length);
```

### `removal-sim.sh`

```bash
#!/usr/bin/env bash
# Usage (repo root): INSTALLED=<checkout>/room OUT=<empty scratch dir> bash removal-sim.sh
# Works on a throwaway copy. Writes only inside $OUT.
set -u
SIM="$OUT/sim"; rm -rf "$SIM"; mkdir -p "$SIM/room/apps/api"
cp -R room/apps/web "$SIM/room/apps/web"
cp -R room/apps/api/src "$SIM/room/apps/api/src"
ln -s "$INSTALLED/apps/web/node_modules" "$SIM/room/apps/web/node_modules"
ln -s "$INSTALLED/apps/api/node_modules" "$SIM/room/apps/api/node_modules"
cd "$SIM/room/apps/web"
build() {
  ./node_modules/.bin/vite build --configLoader runner --outDir "$OUT/$1" --emptyOutDir --logLevel error >/dev/null 2>"$OUT/$1.err"
  rc=$?; css=$(ls "$OUT/$1"/assets/*.css); js=$(ls "$OUT/$1"/assets/*.js)
  printf '%-24s exit=%s css=%s js=%s jssha=%s\n' "$1" "$rc" "$(wc -c <"$css" | tr -d ' ')" "$(wc -c <"$js" | tr -d ' ')" "$(shasum -a 256 "$js" | cut -c1-10)"
}
build baseline
perl -i -ne "print unless /\@import 'tw-animate-css';/" src/index.css
build no-tw-animate
rm src/components/ui/card.tsx src/lib/utils.ts
build plus-no-card-utils
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit --incremental false; echo "tsc after removals exit=$?"
perl -i -ne "print unless m{import './expression-lab.css';}" src/components/expression-lab.tsx
build plus-no-lab-css-import
```
