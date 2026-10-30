# Saved run reports

Open Maestro's **Run and outputs** view and find **Reports**. Choose the current
run, select runs explicitly, or choose an inclusive calendar date range. Date
selection uses the browser's displayed time zone and the runs' creation times.
Checked exclusions remove runs from a date range. The run holding the report may
be outside the selected group.

In **Selected runs**, search recorded provider or model identities and set both
creation-date bounds to narrow the chooser. Search includes historical attempts
and structured outcome candidates, even after a seat changes models. Runs with
unknown attribution remain available when search is empty. Filters preserve
checked runs and show how many selected runs are hidden. Use **Clear selection**
to remove those checks or **Clear chooser filters** to show them again. These
filters do not change **Date range** membership.

**Generate report** creates a new saved generation. History shows queued,
building, ready, and failed generations. An uncertain network response offers
**Retry same request** with the original request ID and selection. A deliberate
new request creates another generation. Retrying a failed generation returns its
recorded failure; discard the request and generate again to make a new attempt.

From history, **Generate with exact run IDs** captures the same membership again
with current facts. **Refresh saved date filter** resolves the saved dates and
exclusions again, which may select a different group. Existing generations keep
their captured facts and membership.

## Read and share a report

Ready reports offer an isolated preview, **Download HTML**, and three JSON files.
The HTML contains its CSS, fonts, numeric tables, and chart data. It opens by
itself without the application or sibling files. Interactive Recharts charts use
pinned CDN libraries. The static summary and tables remain readable offline or
with JavaScript disabled.

Reports use Basecoat CSS and the fixed Black Lacquer palette generated from the
room's canonical default tokens. Changing the room's active theme does not change
a saved report. Charts run in their own React runtime inside the report document.

The report distinguishes current confirmed decisions, stale confirmations,
proposals, and unjudged runs. Model preference counts use decisive reviewed A/B
outcomes between different exact models. Goal and criterion assessments belong
to the shared run decision. They are not per-model solve grades. Configuration,
phase, coverage, and Maestro work retain separate groups.

Complete token totals, observed partial usage, and unknown usage are separate.
Cached input and reasoning output are subsets where the provider defines them
that way; the report does not add them again. Candidate resource comparisons use
the exact turns referenced by the outcome. Total burden includes retries,
failures, and discussion. Summed execution time can overlap and is not run wall
time. Paired deltas require compatible measurements from the same run.

These are observational comparisons. Different tasks, opponents, configurations,
and measurement coverage can change the result. A matching task hash alone does
not establish a controlled benchmark. Saved reports are snapshots, so overlapping
generations must not be counted as independent runs.

## Files and limits

Each generation is stored under
`$ROOM_CONTROL_HOME/workbench/runs/<owning-run>/report/<generation>/`. The default
control home is `~/.local/state/lilbits`.

| File               | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `index.html`       | Standalone report with static tables and progressive charts              |
| `snapshot.json`    | Complete allowlisted source facts from one SQLite read transaction       |
| `report-data.json` | Derived metrics under the recorded metric policy                         |
| `manifest.json`    | Membership, versions, dependency pins, source revisions, and file hashes |

Exports include saved questions, success criteria, approved structured decisions,
exact model attribution, and numeric telemetry. Private Maestro conversation,
full prompts and grounding, continuation IDs, local paths, tool arguments and
results, and artifact bodies are excluded. Review exported questions and approved
evidence before sharing them outside your intended audience.

A generation allows up to 1,000 runs and 50,000 attempts. At most eight generations
may be queued or building. HTML is capped at 5 MiB; unusually long source text or
many distinct configurations can reach that limit earlier. Oversized generations
fail visibly. Large timelines disclose their deterministic sample of at most
1,000 attempts. All statistics use the full capture, and `snapshot.json` retains
the complete exported attempt facts.

Publication writes and checks all files before making a generation ready. Saved
files are integrity checked before serving. An interrupted generation is marked
failed on restart unless a complete published directory can be recovered. It is
never silently regenerated from newer source facts.

## HTTP surface

All routes are beneath `/api/runs/:owningRunId/reports` and use the local room
origin restrictions.

| Method and path        | Result                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `POST /`               | Accept `{requestId, selection}` idempotently for this owning run |
| `GET /`                | Generation history; optional opaque `before` cursor and `limit`  |
| `GET /sources`         | Run IDs and recorded historical provider and model identities    |
| `GET /:id`             | Generation status and captured membership                        |
| `GET /:id/preview`     | HTML with the dedicated report content security policy           |
| `GET /:id/download`    | HTML attachment                                                  |
| `GET /:id/files/:name` | One of the three fixed JSON filenames                            |

The shared schemas in `packages/reporting` define the current request and response
formats. The [accepted implementation plan](cross-run-reporting-plan.md) records
the metric rules, publication boundaries, and scope of this release.

`task checks` runs the metric, SQLite, publication, HTTP, and renderer tests along
with the application's checks and builds. `task reports:scale` generates
synthetic fixtures at 10, 100, and 1,000 runs, ending at 50,000 attempts, and checks
the rendered HTML size. Its observations describe the report generator, not live
model performance.

Snapshots record their schema and metric policy versions. Derivation rejects
unsupported historical metric policies. Reproducing the original HTML requires
the original trusted renderer and assets; a version string alone does not preserve
an executable build. Keep the original saved HTML when that build is unavailable.
