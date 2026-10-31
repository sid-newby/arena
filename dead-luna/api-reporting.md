# Dead-code audit: API and reporting

**Target:** `/Users/sidnewby/Prog/arena` at `5006bd1adbec53a60162c82eb41952dbb594d976` (HEAD matched; checkout was clean).
**Scope:** `room/apps/api/**`, `room/packages/reporting/**`.
**Status:** ISSUES (two probable unused public declarations and two test-only production API helpers); no confirmed production-dead modules or behavior found.
**Blocked:** No.

## Findings

| Status | Location | Symbol | Evidence | Confidence |
|---|---|---|---|---|
| Probable unused | `room/packages/reporting/src/contracts.ts:3` | `SCHEMA_VERSION` | Whole-repo identifier search (excluding lockfile and generated `render-assets.ts`) returned only its declaration. The report snapshot and manifest currently encode `schemaVersion: z.literal(1)` directly, so the exported constant is not the runtime source of either version. | High that it is unused in this checkout; medium that it is removable because external consumers may import the package export. |
| Probable unused | `room/packages/reporting/src/contracts.ts:195` | `ReportRun` | Whole-repo identifier search (same exclusions) returned only its declaration. `runSchema` itself is used by `reportSnapshotSchema`; this finding is only the exported inferred alias. | High that it is unused in this checkout; medium that it is removable because external consumers may import the package export. |

These are exported from the package root indirectly through `room/packages/reporting/src/index.ts:1` (`export * from './contracts.js'`). The package is marked private, but workspace external consumers cannot be ruled out from repository evidence. Treat as cleanup candidates, not safe deletion instructions absent an API-compatibility decision.

## Entry-point and dynamic-use checks

- API production entry is `room/apps/api/src/main.ts`, which creates `AppModule`. `room/apps/api/src/app.module.ts:18-50` explicitly registers all API controllers and providers. Its imported controller/service graph covers the source modules under the requested API scope; no orphan source module was identified.
- Nest decoration and DI were checked: `ReportController` is registered in `AppModule`; `ReportService` is a provider; `REPORT_RUNTIME` is bound to the factory at `app.module.ts:34-39`; `MAESTRO_RUN_TOOLS` is bound via the `DebateService` factory at `:45-48`. Those are runtime wiring, not dead exports.
- Dynamic import checked explicitly: `app.module.ts:37-38` imports the string `@lilbits/reporting/renderer`. This resolves through the `./renderer` package export in `room/packages/reporting/package.json:15-18` to `dist/render.js`; `render.ts` exports `renderReport` and re-exports `reportAssets`. The apparent lack of a static renderer import is intentional.
- Reporting package entrypoints: root exports contracts and metrics (`src/index.ts`); renderer is imported dynamically by API and used by publisher; fixtures are used by reporting tests through relative source imports and by scale scripts through relative compiled imports. The `./fixtures` package subpath is exported but has no in-repository importer. Build scripts regenerate `src/render-assets.ts` from the CSS/controller inputs and package configuration builds it into `dist`; the generated asset file and vendor fonts/CSS are intentional data inputs, not dead source.
- `pairedDelta` is exported but used inside `deriveReportData` and in metrics tests. `fixtureAttempt`, snapshot/report fixture helpers are used by tests or scale scripts. Their tool/test-only role is visible, so they are not production-code-removal findings.

## Rejected hypotheses / classification

- **Reporting fixture subpath is dead:** rejected. `scripts/measure-scale.mjs`, `scripts/verify-render-scale.mjs`, and package tests import fixture exports. These are intentional test/scale-only utilities; no ordinary app runtime import was found.
- **`render-assets.ts` is stale generated output:** rejected. `build-assets.mjs` writes it, `render.ts` re-exports its assets, and the API renderer path consumes that export dynamically.
- **API service/provider files that are not listed as direct `AppModule` providers are dead:** rejected as a method. Modules such as stores, runtime helpers, and workspace utilities are imported transitively by registered services/controllers; Nest controller/provider registration alone is not the entire graph.
- **No external consumers exist:** unproven. The package is private and repository searches found no other workspaces consuming these two symbols, but published/third-party usage is outside this checkout.

## Evidence commands and outputs

Commands were run read-only from the repository root; no tests, builds, installs, network calls, or source edits were performed. Probe notes reside under `/tmp/arena-dead-luna-api/`.

1. `git status --short --branch && git rev-parse HEAD && git rev-parse 5006bd1`
   Output: `## codex/agent-interrupt-rnd`; HEAD `5006bd1adbec53a60162c82eb41952dbb594d976`; requested commit resolved to the same hash.
2. `cat room/AGENTS.md && cat room/CLAUDE.md` (repo instructions discovery found `room/AGENTS.md`, `room/CLAUDE.md`; no API/reporting-specific nested instruction files).
   Output inspected: project guidance; no additional dead-code rule.
3. `cat room/apps/api/src/app.module.ts room/apps/api/src/main.ts room/apps/api/src/app.setup.ts room/packages/reporting/src/index.ts`
   Output inspected: bootstrap, Nest registration and package root barrel.
4. `rg -n "\\bSCHEMA_VERSION\\b|\\bReportRun\\b" room --glob '!pnpm-lock.yaml' --glob '!src/render-assets.ts'`
   Output: exactly `contracts.ts:3` and `contracts.ts:195` declarations.
5. `rg -n "@lilbits/reporting(/fixtures|/renderer)?|from ['\"]\\.\\.?/.*(narration|criteria-generation|side-conversation|state\\.tools|state\\.store|reporting)" room --glob '!pnpm-lock.yaml' --glob '!src/render-assets.ts'`
   Output inspected: root package use in API/web, renderer package use as dynamic string, fixture imports in scripts/tests, and API transitive imports. No production orphan was established.
6. `rg -n "@lilbits/reporting/fixtures|@lilbits/reporting/renderer|from '@lilbits/reporting'" room`
   Output: API dynamic renderer import at `app.module.ts:37`, API static imports in reports repository/publisher, web imports, package dependencies and scripts. Fixture subpath is not a web/API production dependency.
7. `rg -n "controller:|providers:|import\\(renderer\\)|@Controller|@Get|@Post|@Inject|@Module|@Injectable" ...`
   Output inspected: Nest registration, report route decorators, and token injection bindings.

## Coverage and limitations

- Inspected production and test file inventories, package scripts/exports, TypeScript/Nest configs, API boot/module, report DI and route implementation, reporting public entrypoints/contracts, generated asset build path, and static cross-references.
- No build, test suite, coverage report, runtime launch, bundler graph, or external-consumer scan was run. The conclusion is static reachability evidence, not proof against reflection, user-controlled loading, or consumers outside the checkout.
- All obvious API file imports are relative and statically traceable through `AppModule`; the one non-static package import was manually checked against package exports and build configuration.

## Deeper symbol and method pass

A second pass compared exported declarations and public methods against both production source and tests. It found two additional repo-local test-only entrypoints:

| Status | Location | Symbol | Evidence | Confidence |
|---|---|---|---|---|
| Test-only production helper; probable dead production API | `room/apps/api/src/chat/runtimes.ts:208-219` | `createRuntimes` | The only references are its export/declaration and `room/apps/api/test/unit/chat/runtimes.spec.ts:25,75`. Production chat and Maestro paths call `createParticipantRuntime` directly (`chat.service.ts:68-69`, `maestro.service.ts:24,124`). It wraps two calls to that production-used factory. | High for repo-local test-only status; medium for removal because it is an exported source symbol and could be consumed externally. |
| Test-only production helper; probable dead production API | `room/apps/api/src/reports/report.publisher.ts:73-75` | `ReportPublisher.idle()` | Source use search found no caller. Tests call it to await the async publisher queue (publisher specs and report-controller spec); service lifecycle uses `close()`, while report requests dispatch through `request()`. The method merely awaits `running`; it does not contain queue processing. | High for repo-local test-only status; medium for removal because it is a public method on a production class. |

These helpers do not reveal unreachable production subsystems: `createRuntimes` delegates to `createParticipantRuntime`, which production calls directly, and `idle()` only observes the queue promise that production already runs independently. `CodexClient.nextId` was a write-only-field-search candidate, but `this.nextId++` reads the old value to allocate request IDs; rejected as dead state. No other all-write private fields were emitted by the lexical field probe. Public controller methods are externally reachable through Nest route decorators; publisher methods `request`, `file`, and `integrity` are reached from routes/lifecycle/internal calls.

The exported declaration scan also surfaced `SCHEMA_VERSION` and `ReportRun` above. Other apparent low-reference exports were checked and have internal call sites, Nest registration, or route/decorator use. It is a lexical candidate generator, not a TypeScript semantic unused-code checker; identifier-name collisions can produce false negatives and properties assembled dynamically can be missed.

### Reproducible lexical probe source

The following probe only reads the selected source/test/script trees. It lists low-reference exported declarations as review candidates, not findings by itself. Public methods were checked separately with targeted source/test searches:

```python
"""Read-only lexical inventory of exported declarations."""
from pathlib import Path
import re
root = Path('/Users/sidnewby/Prog/arena/room')
scopes = [root/'apps/api/src', root/'apps/api/test', root/'packages/reporting/src', root/'packages/reporting/test', root/'packages/reporting/scripts']
files = [p for base in scopes for p in base.rglob('*') if p.is_file() and p.suffix in {'.ts','.tsx','.js','.mjs'} and p.name != 'render-assets.ts']
texts = {p: p.read_text(errors='replace') for p in files}
for base in (root/'apps/api/src', root/'packages/reporting/src'):
    for p in sorted(base.rglob('*.ts')):
        if p.name == 'render-assets.ts': continue
        source = texts[p]
        exported = re.findall(r'^export\s+(?:async\s+)?(?:function|class|const|type|interface|enum)\s+([A-Za-z_$][\w$]*)', source, re.M)
        for name in exported:
            hits=[]
            for q,t in texts.items():
                for m in re.finditer(r'\b'+re.escape(name)+r'\b', t):
                    if q == p and source[max(0,m.start()-30):m.start()].rstrip().endswith(('function','class','const','type','interface','enum')): continue
                    hits.append(f'{q.relative_to(root)}:{t.count(chr(10),0,m.start())+1}')
            decl_line = next((source.count(chr(10),0,m.start())+1 for m in re.finditer(r'^export\s+(?:async\s+)?(?:function|class|const|type|interface|enum)\s+'+re.escape(name)+r'\b', source, re.M)), -1)
            hits = [h for h in hits if h != f'{p.relative_to(root)}:{decl_line}']
            if len(hits) <= 2:
                print('EXPORT', name, p.relative_to(root), 'other_mentions=', ';'.join(hits) or 'none')
```

The probe output is preserved at `/tmp/arena-dead-luna-api/symbol-probe-output.txt`; its positive/low-reference cases were manually checked against `rg`, Nest registration, route decorators, and direct call paths. Method checks used read-only targeted searches for `createRuntimes`, `ReportPublisher` call sites, and all `this.<field>` references for fields declared with private/protected initializers.

### Expanded coverage and gaps

- Reviewed all exported functions surfaced by the probe with low reference counts; there were no additional probable dead exports beyond the four findings in the two tables.
- Reviewed report publisher methods against controller, service lifecycle, and unit test callers. `idle()` is the only production-class method confirmed to be referenced only by tests in this focused method pass.
- Checked private/protected initialized fields for all occurrences that look like writes. `CodexClient.nextId` is read-modify-write. No write-only private field was confirmed.
- The probe is intentionally lexical and does not parse TypeScript AST. It cannot prove semantic reachability or discover reflection, framework metadata beyond the manually checked Nest paths, generated names, or external package consumers. No test/build execution or dynamic runtime instrumentation was performed.

## Codex aggregation correction

The fixture implementations are live, while the `./fixtures` package export has no in-repository importer. Codex verified that tests import `../src/fixtures.js` and scripts import `../dist/fixtures.js`. The entrypoint description above has been corrected to distinguish implementation reachability from use of the package export. This additional unused subpath is a public-interface decision, not an automatic deletion recommendation. Markdown hard-break whitespace was normalized during collection.
