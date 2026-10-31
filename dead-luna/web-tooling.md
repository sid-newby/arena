# Arena dead-code audit — web and tooling slice

Target: `/Users/sidnewby/Prog/arena` at `5006bd1adbec53a60162c82eb41952dbb594d976` (2026-10-30, “Document seat messaging controls and finalize verification”). Read-only audit; no source edits, installs, test runs, paid calls, commits, or additional agents. Two read-only static probes were run; their sources and outputs are preserved inline below and under `/tmp/arena-dead-luna-web/`.

## Result

**ISSUES — two confirmed orphan web source modules and one confirmed low-impact dead CSS selector group.** No BLOCKED items. This is a static ownership/reference audit, not a proof from executing the app. I did not infer deadness from absence of a literal filename match where import resolution, generated assets, user-invoked browser checks, or retained templates provide ownership.

## Evidence and findings

| Status | Scope | Evidence / conclusion | Confidence |
|---|---|---|---|
| PASS | Web app entry/import graph | `room/apps/web/index.html:10` loads `/src/main.tsx`; `src/main.tsx:1-9` renders `App`. `use-run-setup.tsx:27-31` imports `runPresentation`, `RunArtifacts`, `ScaffoldPicker`, and `OutcomeReview`; `runPresentation` also has unit coverage in `test/run-presentation.test.mjs`. The path-aware static import probe traced 45 source modules from `main.tsx` and identified the two unreachable modules below. | High within literal local-import resolution |
| ISSUE | Confirmed orphan web modules | `room/apps/web/src/components/ui/card.tsx:1-102` exports `Card` components via an export list (`:94-102`) but is not imported/reached from the web entry. `room/apps/web/src/lib/utils.ts:1` only re-exports `cn` from package `cn`, while UI components import `cn` directly from the package; no source or test imports `lib/utils`. The corrected path-aware probe lists exactly these two unreachable TS/TSX modules. Intent is unknown; classification is based on no first-party import path at this commit. | High for current web app reachability |
| PASS | Web UI-owned assets | `ThemeControls` imports `themes/fonts.json` and `themes/fonts.css` (`theme-controls.tsx:5-8`); the font catalog enumerates 27 families (`fonts.json:1-28`), and the CSS declares corresponding `/fonts/...` faces. Logo SVGs are referenced from `src/index.css:350,353`; favicon is linked from `index.html:5`. Those public assets are app inputs. `dist/` and `node_modules/` appeared in filesystem inventory but `git ls-files` returned no tracked paths for them, so they are generated/local artifacts, not candidate tracked dead files. | High |
| PASS | Startup scripts and test layout | `room/package.json:6-17` wires `start-with-cartesia.mjs`, `wait-for-api.mjs`, `free-ports.mjs`, and `check-test-layout.mjs` through `dev:speech`, `dev:text`, `ports:clear`, and `test`. `room/test/scripts/wait-for-api.test.mjs` imports the readiness function. Root `Taskfile.yml:6-11` wires `evaluate-narration.mjs` as `narration:eval`. `room/test/scripts/agent-messaging.probe.mjs` is explicitly documented as a manual deterministic API probe in `room/docs/agent-interruption-rnd.md:132-134`. | High |
| PASS | Browser verification modules | The `*.browser.mjs` modules are not matched by the web package’s `node --test test/*.test.mjs` glob (`apps/web/package.json:8`), but they are intentionally manual browser modules: `panel-hit-targets.browser.mjs` exports `verifyPanelHitTargets`; `speech-lifecycle.browser.mjs` exports `mountSpeechChecks`; `room/DESIGN.md:288` documents panel hit-target verification and `room/docs/cartesia-tts.md:25` gives the speech module’s browser import/use flow. Not dead or accidentally omitted based on current repo references. | High |
| PASS | OpenAI, Anthropic, Cartesia, scaffolds | `openai/luna.ts` is an executable standalone script wired by `openai/package.json:6`, documented with invocation at `openai/README.md:5-19`, and intentionally retained as reference by `scaffolds/react-nest/template/ON-HOLD.md:61`. The Anthropic builder agent definition and lock are managed-agent reference material, not a runtime service (`ON-HOLD.md:63-65`); its own README/definition/lock are co-located. `cartesia/.env.example` and protocol docs are reference/config inputs; startup wrapper is live as above. `scaffolds/react-nest/source.json` records the scaffold snapshot, while `template/` contains its own runnable template. No tracked root `assets/` or `dotfiles/` files were returned by `git ls-files` for those paths. | High for ownership classification |
| PASS | Root and workspace configuration | Root `Taskfile.yml`, room/package scripts, workspace package definitions, Vite config, and TS configs are directly consumed by the documented Taskfile/package tooling. `room/apps/web/vite.config.ts` establishes the Vite app, aliases, ports and API proxy. No unreferenced root config candidate was found in the requested categories. | Medium-high |

## Rejected dead-code hypotheses

- `outcome-review.tsx` looked unreferenced from the visible first portion of `App.tsx`; it is imported and rendered by `hooks/use-run-setup.tsx` (lines 31 and 1741).
- `run-presentation.ts` looked test-only in a basename scan; it is imported by `use-run-setup.tsx:27` and is also tested.
- `message-scroller.tsx` and `input-group.tsx` have active UI import sites. `card.tsx` is not imported/reached in the web app; its export-list declarations were omitted by the first export-declaration regex. `lib/utils.ts` only re-exports `cn` from package `cn`, while web UI components import `cn` directly from that package; `rg` finds no import of `lib/utils.ts`. Both files are confirmed orphan modules.
- Browser `.browser.mjs` files are intentionally manually loaded, with instructions in DESIGN/docs; the `*.test.mjs` script glob alone is not evidence they are orphaned.
- Many `dist/` font copies looked duplicate against `public/fonts/`; `dist/` is not tracked and is ordinary Vite output. Likewise existing `node_modules/` entries are not tracked.
- The large font set and license files are not unused by default: theme font selection exposes the complete declared font catalog and its font-face map.
- Scaffold files and `openai/luna.ts` are retained examples/templates with explicit source metadata/documentation, not accidental production runtime clutter.

## Read-only commands and observed outputs

Commands run from `/Users/sidnewby/Prog/arena`:

1. `git rev-parse HEAD; git status --short; git show -s --format='%H%n%cs%n%s' 5006bd1; git diff --stat 5006bd1 --`
   - HEAD: `5006bd1adbec53a60162c82eb41952dbb594d976`.
   - `git status --short` and `git diff --stat 5006bd1 --` emitted no output (clean checkout at target).
   - Target commit: same hash, `2026-10-30`, `Document seat messaging controls and finalize verification`.
2. `git ls-files -- room/apps/web/dist room/apps/web/node_modules scaffolds/react-nest/template/node_modules cartesia/.env`
   - No output; these discovered filesystem paths are not tracked at this commit.
3. `git ls-files` over assigned roots showed tracked app sources/assets/tests, five room scripts and two script tests, the OpenAI standalone client, Anthropic agent references, Cartesia docs/example env, and the React/Nest scaffold. No root `assets/` or `dotfiles/` paths were returned.
4. `rg` over package scripts, source imports, docs, HTML, CSS, tests, scaffold metadata and user-facing docs found the entrypoints and references summarized above. Exact source references are listed in the evidence table.

## Coverage and limitations

- Covered the requested `room/apps/web/**`, `room/scripts/**`, `room/test/**`, top-level `Taskfile.yml`, `openai/`, `anthropic/`, `cartesia/`, and `scaffolds/`, plus tracked-path inventory for root `assets/` and `dotfiles/`.
- Traced web entrypoints/imports and generated/public asset ownership; script/package/task invocations; tests and manual browser probes; retained scaffold and agent/client examples.
- Did not run builds, lint, tests, browsers, network lookups, or dynamic feature paths. No TypeScript compiler symbol graph or runtime CSS cascade analysis was performed. The appended regex import graph checks literal local imports; the selector pass is a candidate finder followed by manual class construction/reference checks. API implementation ownership, backend/reporting internals, and package/dependency necessity outside the assigned ownership are excluded for the other worker.


## Codex verification correction (follow-up)

The earlier report incorrectly stated that `src/lib/utils.ts` was used by UI components and that no component module was orphaned. Codex rechecked the actual files after the parent verification caught the inconsistency. `utils.ts:1` only re-exports `cn` from the package `cn`; UI modules import that package directly. `card.tsx:94-102` uses an export list, which the earlier declaration regex did not capture; none of those exports are imported or reached from `main.tsx`. The path-aware probe reports both modules unreachable. These are confirmed orphan source files as of the audited commit; their original design intent cannot be inferred from current references.

Read-only direct check: `rg -n "lib/utils|@/lib/utils|from.*ui/card|from.*card|from.*cn|export \{" room/apps/web/src room/apps/web/test`. Output: only direct package-`cn` imports in `button.tsx`, `bubble.tsx`, `card.tsx`, `input-group.tsx`, `input.tsx`, `message-scroller.tsx`, `message.tsx`, and `textarea.tsx`; `utils.ts:1` reexports `cn`; no `lib/utils` import or `card` module import. `git status --short` emitted no output.

### Path probe source

```js
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, extname } from 'node:path';
const root='/Users/sidnewby/Prog/arena/room/apps/web/src';
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(/\.(tsx?|css|json)$/.test(e.name))out.push(p)}return out}
const files=await walk(root), known=new Set(files.map(f=>resolve(f))), source=new Map(await Promise.all(files.map(async f=>[resolve(f),await readFile(f,'utf8')])));
const entry=resolve(root,'main.tsx'), seen=new Set();
function target(from,spec){if(spec.startsWith('@/'))return resolve(root,spec.slice(2));if(spec.startsWith('.'))return resolve(from,'..',spec);return null}
function resolveModule(p){for(const c of [p,p+'.tsx',p+'.ts',p+'.css',p+'.json',join(p,'index.tsx'),join(p,'index.ts')])if(known.has(resolve(c)))return resolve(c);return null}
function visit(f){if(seen.has(f))return;seen.add(f);const text=source.get(f)||'';for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\()(['"])([^'"]+)\1/g)){const p=target(f,m[2]);if(p){const r=resolveModule(p);if(r)visit(r)}}}
visit(entry);
console.log('entry:',relative(root,entry));console.log('reachable source modules:',seen.size);console.log('unreachable TS/TSX modules:');for(const f of files.filter(f=>/\.tsx?$/.test(f)&&!seen.has(resolve(f))))console.log(relative(root,f));
const util=resolve(root,'lib/utils.ts'),card=resolve(root,'components/ui/card.tsx');
for(const f of [util,card]){const text=source.get(f)||'';console.log(`${relative(root,f)} module import edges:`,[...text.matchAll(/(?:\bfrom\s*|\bimport\s*\()(['"])([^'"]+)\1/g)].map(m=>m[2]).join(', ')||'(none)')}
```

Command: `node /tmp/arena-dead-luna-web/reachability-probe.mjs`. Actual output:

```text
entry: main.tsx
reachable source modules: 45
unreachable TS/TSX modules:
components/ui/card.tsx
lib/utils.ts
lib/utils.ts module import edges: cn
components/ui/card.tsx module import edges: react, cn
```

## Deep static probe (requested follow-up)

A read-only Node probe scanned the web TS/TSX/CSS source and test files. It found no exported declaration whose identifier appeared only at its declaration site. The simple CSS text-matcher surfaced selector candidates but cannot resolve template-string-generated classes. Manual checks rejected those dynamic-class candidates except `.voice-status`, which has no element/class assignment anywhere in source and is superseded by the actual `.speech-feedback` element.

**ISSUE — confirmed stale CSS selector group (low impact).** `room/apps/web/src/index.css:745-748` styles `.voice-status`, with a second `.voice-status` rule at `:811-813`; `room/apps/web/src/arena.css:181-183` hides `.room-utility .voice-status` at the mobile breakpoint. The only speech status markup is `<output className="speech-feedback">` at `room/apps/web/src/components/speech-controls.tsx:52`, styled by `.speech-feedback` in `speech-controls.css:11`. `rg -n "voice-status|speech-feedback" room/apps/web/src` returned only the three CSS `.voice-status` mentions plus the speech-feedback JSX/CSS mentions. No dynamic class construction for `voice-status` was found. Confidence: high that these selectors cannot match; low impact since they are inert styles.

### Dynamic selector hypotheses manually rejected

- `.pose-a` / `.pose-b` are produced by the `pose-${id}` class on the rendered pose controls (`App.tsx` pose fieldset map); selector references are in `arena.css:171-173`.
- `.agent-a` / `.agent-b` are generated by the `agent-${id}` panel class; panel-specific activity timing rules in `components/panel-expression.css:8-13` apply.
- `.screen-expression-annoyed`, `-grumpy`, `-amused`, and `-startled` are emitted from the expression mood class construction in the panel rendering path, not literal class strings; `panel-expression.css:60-88` styles the supported mood-specific animations. `skeptical` intentionally has no special animation rule.
- `.provider-codex` and `.provider-anthropic` are emitted from provider-dependent class construction in `AgentPanel`; the corresponding public SVGs are linked from those selectors (`index.css:349-354`).
- `.ttf` results in the naive regex are URLs in `@font-face`, not CSS class selectors.

### Hook state, return members, callback props, and refs

Manually followed each exported hook call site in `App`, `AgentPanel`, `MaestroDialog`, `RunSetup`, `SideConversation`, and `SpeechControls`. The `useAgents` result is spread into `AgentPanel` and individual fields are used by `App`; `useSpeech` return fields are consumed by `App` and `SpeechControls`; `useMaestro` state/actions feed the dialog; `useRunSetup` result feeds the setup dialog/components; `useSideConversation` fields feed its dialog controls; panel-expression/motion return values feed `AgentPanel`. No unconsumed hook return member or write-only state/ref was confirmed by this inspection. Request/animation/retry refs are read by async callbacks/effects; their lack of JSX occurrence is intentional. The first declaration-occurrence probe is incomplete: it scanned web source files only, found no low-occurrence references among the 125 declarations it recognized, but it does not parse export lists such as `card.tsx:94-102`, nor does a token occurrence establish module import reachability. The path graph and direct `rg` checks below identify the orphan modules. Callback props passed from `App` to `AgentPanel` and preview callbacks into `ExpressionLab` have call sites in the child components.

Probe did not attempt general control/data-flow analysis: “no confirmed unused member” is a manual result, not a compiler proof. The probe only counts same-name token occurrences and can be fooled by comments, similarly named declarations, imported test references, or generated selectors.

### Probe source (verbatim)

```js
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
const root = '/Users/sidnewby/Prog/arena/room/apps/web/src';
async function walk(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) result.push(...await walk(p));
    else if (/\.(tsx?|css)$/.test(e.name)) result.push(p);
  }
  return result;
}
const files = await walk(root);
const texts = new Map(await Promise.all(files.map(async f => [f, await readFile(f, 'utf8')])));
const app = [...texts].filter(([f]) => !f.includes('/test/'));
console.log('tracked-like web source files scanned:', files.length);
const exported = [];
for (const [f, s] of app) {
  const re = /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const m of s.matchAll(re)) exported.push({f, name:m[1], line:s.slice(0,m.index).split('\n').length});
}
console.log('exported declaration count:', exported.length);
console.log('export occurrence count <= 1 across web source files:');
for (const x of exported) {
  const needle = new RegExp(`\\b${x.name}\\b`, 'g');
  let count = 0;
  for (const [,s] of texts) count += [...s.matchAll(needle)].length;
  if (count <= 1) console.log(`${relative(root,x.f)}:${x.line} ${x.name} count=${count}`);
}
const cssFiles = [...texts].filter(([f])=>f.endsWith('.css'));
const sourceText = app.filter(([f])=>!f.endsWith('.css')).map(([,s])=>s).join('\n');
console.log('first-party CSS simple class selectors with no literal TSX/source mention (candidate list; dynamic/generated classes are possible):');
for (const [f,s] of cssFiles) {
  for (const m of s.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    const name=m[1];
    if (name.startsWith('dark') || name.startsWith('group') || name.startsWith('peer') || name.startsWith('data') || name.startsWith('has')) continue;
    if (!sourceText.includes(name)) console.log(`${relative(root,f)}:${s.slice(0,m.index).split('\n').length} .${name}`);
  }
}
```

### Probe invocation and actual output

Command: `node /tmp/arena-dead-luna-web/deep-probe.mjs` from the repository root. It exited successfully and printed:

```text
tracked-like web source files scanned: 58
exported declaration count: 125
export occurrence count <= 1 across web source files:
first-party CSS simple class selectors with no literal TSX/source mention (candidate list; dynamic/generated classes are possible):
arena.css:171 .pose-b
arena.css:172 .pose-a
arena.css:181 .voice-status
components/panel-expression.css:8 .agent-a
components/panel-expression.css:60 .screen-expression-annoyed
components/panel-expression.css:64 .screen-expression-grumpy
components/panel-expression.css:80 .screen-expression-amused
components/panel-expression.css:84 .screen-expression-startled
index.css:349 .provider-codex
index.css:352 .provider-anthropic
index.css:745 .voice-status
index.css:793 .provider-anthropic
index.css:811 .voice-status
themes/fonts.css:6 .ttf
themes/fonts.css:13 .ttf
themes/fonts.css:20 .ttf
themes/fonts.css:27 .ttf
themes/fonts.css:34 .ttf
themes/fonts.css:41 .ttf
themes/fonts.css:48 .ttf
themes/fonts.css:55 .ttf
themes/fonts.css:62 .ttf
themes/fonts.css:69 .ttf
themes/fonts.css:76 .ttf
themes/fonts.css:83 .ttf
themes/fonts.css:90 .ttf
themes/fonts.css:97 .ttf
themes/fonts.css:104 .ttf
themes/fonts.css:111 .ttf
themes/fonts.css:119 .ttf
themes/fonts.css:126 .ttf
themes/fonts.css:134 .ttf
themes/fonts.css:141 .ttf
themes/fonts.css:148 .ttf
themes/fonts.css:155 .ttf
themes/fonts.css:162 .ttf
themes/fonts.css:169 .ttf
themes/fonts.css:176 .ttf
themes/fonts.css:184 .ttf
themes/fonts.css:191 .ttf
themes/fonts.css:198 .ttf
themes/fonts.css:205 .ttf
themes/fonts.css:212 .ttf
themes/fonts.css:219 .ttf
```

Probe source and captured stdout are also retained at `/tmp/arena-dead-luna-web/deep-probe.mjs` and `/tmp/arena-dead-luna-web/deep-probe-output.txt`.
