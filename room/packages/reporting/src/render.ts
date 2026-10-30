import { reportDataSchema, REPORT_LIMITS } from './contracts.js';
import type {
  AttemptMetric,
  ModelMetric,
  ReportAssets,
  ReportData,
  RenderedReport,
  ReportSelection,
} from './contracts.js';

type Cell = string | number | null;
const escape = (value: Cell): string =>
  String(value ?? 'Unknown').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
const json = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const number = (value: number | null): string =>
  value === null
    ? 'Unknown'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null): string =>
  value === null ? 'Not comparable' : `${value > 0 ? '+' : ''}${number(value * 100)}%`;
const duration = (value: number | null): string =>
  value === null ? 'Unknown' : `${number(value)} ms`;
const label = (value: string | null): string => value ?? 'Unknown';
const title = (value: string): string =>
  value.replaceAll('-', ' ').replace(/^./, (char) => char.toUpperCase());
const date = (value: number, timeZone: string): string =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long', timeZone }).format(
    value,
  );
const modelLabel = (
  model: Pick<AttemptMetric, 'provider' | 'model' | 'effort' | 'toolProfile' | 'phase'>,
): string =>
  `${label(model.provider)} / ${label(model.model)} · effort ${label(model.effort)} · ${label(model.toolProfile)} tools · ${label(model.phase)} phase`;
function chartAttempt(attempt: AttemptMetric) {
  return {
    modelKey: attempt.modelKey,
    model: attempt.model,
    role: attempt.role,
    elapsedMs: attempt.elapsedMs,
    usage: { input: attempt.usage.input, output: attempt.usage.output },
  };
}
function table(id: string, headers: string[], rows: Cell[][], caption: string): string {
  return `<div class="table-container" role="region" aria-label="${escape(caption)}" tabindex="0"><table class="table" id="${id}"><caption>${escape(caption)}</caption><thead><tr>${headers.map((header) => `<th scope="col">${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell, index) => (index === 0 ? `<th scope="row">${escape(cell)}</th>` : `<td>${escape(cell)}</td>`)).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">No eligible observations in this snapshot.</td></tr>`}</tbody></table></div>`;
}
function selectionDescription(selection: ReportSelection): string {
  switch (selection.kind) {
    case 'current':
      return 'Current run';
    case 'manual':
      return 'Manually selected runs';
    case 'date-range':
      return `Runs created from ${selection.fromInclusive} (inclusive) to ${selection.toExclusive} (exclusive), selected in ${selection.timeZone}. Explicitly excluded: ${selection.excludeRunIds.join(', ') || 'none'}.`;
  }
}
function chart(id: string, name: string): string {
  return `<div id="${id}" class="chart" role="img" aria-label="${escape(name)}. Exact values appear in the following table."></div>`;
}
function distributionRows(models: ModelMetric[], kind: 'tokens' | 'duration'): Cell[][] {
  return models.map((model) => {
    const distribution = model[kind];
    return [
      modelLabel(model),
      model.role,
      model.coverage,
      distribution.count,
      distribution.unknown,
      number(distribution.min),
      number(distribution.median),
      number(distribution.max),
      distribution.p95 === null
        ? 'Not shown (requires 20 known observations)'
        : number(distribution.p95),
      number(distribution.sum),
    ];
  });
}
function runAudit(data: ReportData): string {
  return (
    data.runs
      .map((run) => {
        const task = run.task,
          outcome = run.outcome;
        const decision = outcome?.decision;
        const candidateRows = outcome
          ? ['a', 'b'].flatMap((seat) => {
              const candidate = seat === 'a' ? outcome.candidates.a : outcome.candidates.b;
              return [
                [
                  seat.toUpperCase(),
                  candidate.provider,
                  candidate.model,
                  candidate.turnId,
                  candidate.bindingId,
                  candidate.sha256,
                ],
              ];
            })
          : [];
        return `<details class="audit"><summary>${escape(run.id)} · ${escape(title(run.coverage))}${run.incomplete ? ' · Incomplete' : ''}</summary>
      <div class="audit-grid"><div><p class="eyebrow">Captured goal · revision ${escape(task?.revision ?? null)}</p><p class="run-question">${escape(task?.question ?? 'No saved goal')}</p>${task?.criteria.length ? `<ol class="list">${task.criteria.map((criterion) => `<li>${escape(criterion)}</li>`).join('')}</ol>` : '<p class="muted small">No success criteria recorded.</p>'}</div>
      <dl><dt>Created</dt><dd>${escape(date(run.createdAt, data.timeZone))}</dd><dt>Judging coverage</dt><dd>${escape(title(run.coverage))}</dd><dt>Newer proposal pending</dt><dd>${run.pendingProposal ? 'Yes' : 'No'}</dd><dt>Source commit</dt><dd>${escape(task?.sourceRevision ?? null)}</dd><dt>Task hash</dt><dd class="provenance">${escape(task?.definitionHash ?? null)}</dd><dt>Outcome revision</dt><dd>${escape(outcome?.revision ?? null)}</dd><dt>Assessed goal revision</dt><dd>${escape(outcome?.taskRevision ?? null)}</dd><dt>Selection / goal status</dt><dd>${escape(decision ? `${title(decision.selection)} / ${title(decision.goalStatus)}` : 'Unjudged')}</dd></dl></div>
      ${
        decision
          ? `<p>${escape(decision.summary)}</p>${table(
              `criteria-${run.id}`,
              ['Criterion index', 'Assessment', 'Evidence'],
              decision.criteria.map((criterion) => [
                criterion.index + 1,
                title(criterion.result),
                criterion.evidence,
              ]),
              `Approved structured criterion evidence for ${run.id}`,
            )}`
          : ''
      }

      ${candidateRows.length ? table(`candidates-${run.id}`, ['Seat', 'Provider', 'Exact model', 'Candidate turn', 'Binding', 'Output SHA-256'], candidateRows, `Referenced candidate provenance for ${run.id}`) : ''}
      ${run.warnings.length ? `<ul class="list muted small">${run.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}</details>`;
      })
      .join('') || '<p class="muted">This snapshot contains no selected runs.</p>'
  );
}

/** Renders validated reporting DTOs only; assets are supplied by the trusted renderer build. */
export function renderReport(input: ReportData, assets: ReportAssets): RenderedReport {
  const data = reportDataSchema.parse(input);
  const summary = data.summary;
  const current = data.selection.kind === 'current';
  const firstRun = current ? data.runs.find((run) => run.id === data.anchorRunId) : undefined;
  const outcome = firstRun?.outcome;
  const candidateRows = data.pairs.flatMap((pair) =>
    [pair.a, pair.b].map((attempt) => [
      pair.runId,
      attempt.role.toUpperCase(),
      modelLabel(attempt),
      attempt.usage.coverage,
      attempt.usage.completeness,
      label(attempt.usage.source),
      number(attempt.usage.input),
      number(attempt.usage.output),
      number(attempt.usage.total),
      number(attempt.usage.cachedInput),
      number(attempt.usage.cacheWriteInput),
      number(attempt.usage.reasoningOutput),
      label(attempt.usage.actualModel),
    ]),
  );
  const timelineRows = data.timeline.attempts.map((attempt) => [
    attempt.runId,
    attempt.id,
    title(attempt.role),
    modelLabel(attempt),
    attempt.status,
    attempt.startedAt === null ? 'Unknown' : date(attempt.startedAt, data.timeZone),
    attempt.finishedAt === null ? 'Unknown' : date(attempt.finishedAt, data.timeZone),
    duration(attempt.elapsedMs),
    duration(attempt.queueMs),
    duration(attempt.firstTextMs),
  ]);
  const pairTimingRows = data.pairs.flatMap((pair) =>
    [pair.a, pair.b].map((attempt) => [
      pair.runId,
      attempt.role.toUpperCase(),
      modelLabel(attempt),
      duration(attempt.elapsedMs),
      duration(attempt.queueMs),
      duration(attempt.firstTextMs),
      attempt.startedAt === null ? 'Unknown' : date(attempt.startedAt, data.timeZone),
      attempt.finishedAt === null ? 'Unknown' : date(attempt.finishedAt, data.timeZone),
      attempt.status,
    ]),
  );
  const pairingRows = data.pairs.map((pair) => [
    pair.runId,
    pair.confirmed ? 'Confirmed' : 'Provisional',
    pair.currentTask ? 'Current goal' : 'Stale goal',
    title(pair.selection),
    modelLabel(pair.a),
    modelLabel(pair.b),
    percent(pair.tokenDelta),
    percent(pair.durationDelta),
    pair.exclusions.join('; ') || 'None',
  ]);
  const referenceModels = [
    ...new Map(
      data.pairs
        .filter((pair) => pair.a.modelKey !== null)
        .map((pair) => [pair.a.modelKey, pair.a.model]),
    ).entries(),
  ];
  const csp =
    "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'";
  const chartData = {
    timeZone: data.timeZone,
    timeline: {
      attempts: data.timeline.attempts.map((attempt) => ({
        ...chartAttempt(attempt),
        id: attempt.id,
        runId: attempt.runId,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      })),
      totalAttempts: data.timeline.totalAttempts,
      omittedAttempts: data.timeline.omittedAttempts,
    },
    summary: { selection: summary.selection },
    models: data.models.map((model) => ({
      modelKey: model.modelKey,
      model: model.model,
      effort: model.effort,
      phase: model.phase,
      toolProfile: model.toolProfile,
      coverage: model.coverage,
      tokens: { median: model.tokens.median },
      duration: { min: model.duration.min, median: model.duration.median, max: model.duration.max },
    })),
    pairs: data.pairs.map((pair) => ({
      runId: pair.runId,
      tokenDelta: pair.tokenDelta,
      durationDelta: pair.durationDelta,
      a: chartAttempt(pair.a),
      b: chartAttempt(pair.b),
    })),
  };
  const html = `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><title>arena · ${current ? 'Run' : 'Cross-run'} report · ${escape(data.generationId)}</title><style>${assets.css}</style></head><body>
    <a class="skip" href="#report">Skip to report</a><header class="masthead"><span class="wordmark">arena / run reports</span><small>Black Lacquer · immutable snapshot</small></header>
    <main id="report"><div class="intro"><div><p class="eyebrow">${current ? 'Current run comparison' : 'Observational cross-run comparison'}</p><h1>${current ? 'Run comparison' : 'Cross-run comparison'}</h1><p class="lede">${escape(current && firstRun?.task ? firstRun.task.question : `${number(summary.runs)} selected runs. Outcomes, resource use, and measurement coverage from one frozen snapshot.`)}</p></div><dl class="snapshot"><dt>Captured</dt><dd>${escape(date(data.capturedAt, data.timeZone))}</dd><dt>Selection</dt><dd>${escape(selectionDescription(data.selection))}</dd><dt>Owning run</dt><dd>${escape(data.anchorRunId)}${data.resolvedRunIds.includes(data.anchorRunId) ? '' : ' · outside the selected cohort'}</dd><dt>Generation</dt><dd>${escape(data.generationId)}</dd></dl></div>
    <nav class="toc" aria-label="Report sections"><a href="#decision">Decision</a><a href="#tokens">Tokens</a><a href="#time">Time</a><a href="#deltas">Paired deltas</a><a href="#models">Models & coverage</a><a href="#audit">Run audit</a><a href="#provenance">Provenance</a></nav>
    <div class="scoreline numeric"><div class="score"><strong>${number(summary.runs)}</strong><span>Selected runs</span></div><div class="score"><strong>${number(summary.currentConfirmations)}</strong><span>Current-goal confirmations / ${number(summary.runs)} runs</span></div><div class="score"><strong>${number(summary.completeTokens)}</strong><span>Complete observed tokens</span></div><div class="score"><strong>${number(summary.unknownUsageCount)}</strong><span>Attempts with unknown usage</span></div></div>
    <aside class="notice"><p>These are observational results from the selected runs. Task mix, opponents, configurations, phases, and measurement coverage can differ. They do not establish a universal model ranking or a per-model solve rate.</p>${data.runs.some((run) => run.incomplete) ? '<p>This snapshot includes incomplete work. A saved report does not mean a run is finished, confirmed, or solved.</p>' : ''}</aside>
    <p id="chart-status" class="chart-status" role="status">Charts require the pinned CDN libraries. If they cannot load, every summary and numeric table below remains available offline.</p><noscript><p class="notice">JavaScript is disabled. The complete static report and tables remain available.</p></noscript>
    <section class="section" id="decision"><div class="section-head"><h2>Decision & judging coverage</h2><p>Outcome counts use ${number(summary.currentConfirmations)} current-goal confirmed runs.</p></div><div class="decision"><div class="panel"><p class="eyebrow">${current ? 'Captured decision' : 'Confirmed selection distribution'}</p><p class="decision-title">${escape(current ? (outcome ? `${title(outcome.decision.selection)} · ${title(outcome.decision.goalStatus)}` : 'Awaiting a reviewed outcome') : `${number(summary.currentConfirmations)} confirmed / ${number(summary.runs)} selected`)}</p><p class="muted small">${escape(current ? (outcome ? `${title(outcome.kind)} revision ${outcome.revision}; assessed goal revision ${outcome.taskRevision}. ${firstRun?.coverage === 'current-confirmation' ? 'Included in current-goal counts.' : 'Excluded from current-goal confirmed counts.'}` : 'No candidate pair is guessed from the latest chat.') : 'A and B are candidate seats. Exact model identities remain in the run audit and pair table.')}</p>${current && outcome ? `<p class="small">A: ${escape(outcome.candidates.a.provider)} / ${escape(outcome.candidates.a.model)}<br>B: ${escape(outcome.candidates.b.provider)} / ${escape(outcome.candidates.b.model)}</p>` : ''}${chart('decision-chart', 'Confirmed selection distribution')}</div><div>${table(
      'judging-coverage',
      ['Judging bucket', 'Runs', 'Denominator'],
      [
        ['Current-goal confirmation', summary.currentConfirmations, summary.runs],
        ['Stale confirmation', summary.staleConfirmations, summary.runs],
        ['Proposal without confirmation', summary.proposalsOnly, summary.runs],
        ['No outcome', summary.noOutcome, summary.runs],
      ],
      'Mutually exclusive judging coverage; each selected run appears once',
    )}${table('pending-proposals', ['Additional flag', 'Runs', 'Denominator'], [['Newer pending proposal', summary.pendingProposals, summary.runs]], 'Pending proposals can coexist with a confirmation')}</div></div>
    ${table(
      'selection-counts',
      ['Confirmed selection', 'Runs', 'Current-goal confirmed denominator'],
      Object.entries(summary.selection).map(([selection, count]) => [
        title(selection),
        count,
        summary.currentConfirmations,
      ]),
      'Confirmed selection distribution',
    )}
    ${table(
      'goal-status',
      ['Shared run goal status', 'Runs', 'Current-goal confirmed denominator'],
      Object.entries(summary.goalStatus).map(([status, count]) => [
        title(status),
        count,
        summary.currentConfirmations,
      ]),
      'Goal status belongs to the shared decision, not to individual models',
    )}</section>
    <section class="section" id="tokens"><div class="section-head"><h2>Tokens</h2><p>Candidate comparison and total burden remain separate.</p></div><div class="panel"><h3>Referenced candidate pair usage</h3><p class="muted small">Input already includes cached input; output already includes reasoning. The bars stack only input and output. Unknown components remain unknown in the table. Charts show at most the first 12 captured candidate rows; tables retain all rows.</p>${chart('token-chart', 'Candidate input and output tokens')}<div class="legend"><span>Input · lighter fill</span><span>Output · solid fill</span></div></div>
    ${table('candidate-tokens', ['Run', 'Seat', 'Exact model / configuration', 'Coverage', 'Completeness', 'Source', 'Input tokens', 'Output tokens', 'Total tokens', 'Cached input subset', 'Cache-write input subset', 'Reasoning output subset', 'Actual-model evidence'], candidateRows, 'Referenced candidate usage; subsets are never added again')}
    ${table('token-burden', ['Resource view', 'Complete tokens', 'Observed partial tokens', 'Unknown usage attempts', 'All captured attempts'], [['Total selected-run burden', summary.completeTokens, summary.observedPartialTokens, summary.unknownUsageCount, summary.attempts]], 'Total burden includes retries, failures, and discussion; partial usage is separate')}
    <p class="muted small">The chart shows at most the first 12 model/configuration groups. Every group and all distribution statistics appear in the table.</p>${chart('model-chart', 'Per-model observed token medians')}${table('token-distributions', ['Exact model / configuration', 'Role', 'Coverage', 'Known n', 'Unknown n', 'Minimum tokens', 'Median tokens', 'Maximum tokens', 'p95 tokens', 'Summed observed tokens'], distributionRows(data.models, 'tokens'), 'Per-model token distributions; configuration, phase, coverage, and Maestro groups stay separate')}</section>
    <section class="section" id="time"><div class="section-head"><h2>Execution time</h2><p>Milliseconds · parallel execution can overlap.</p></div><div class="panel"><h3>Referenced candidate durations</h3><p class="muted small">Measured execution uses monotonic elapsed time. Queue and first-visible-text latency are separate. The captured start/end timestamps below describe observed intervals; they do not establish full workflow wall time.</p>${chart('duration-chart', 'Candidate measured execution duration')}</div>
    ${table('candidate-timing', ['Run', 'Seat', 'Exact model / configuration', 'Measured execution', 'Queue delay', 'First visible text', 'Observed start', 'Observed finish', 'Status'], pairTimingRows, 'Candidate timing and observed interval audit')}
    <div class="panel"><h3>A / B / Maestro observed intervals</h3><p class="muted small">${number(data.timeline.attempts.length)} sampled attempts of ${number(data.timeline.totalAttempts)} captured; ${number(data.timeline.omittedAttempts)} omitted from this compact timeline. Sampling preserves full summary statistics. The chart shows at most the first 12 sampled attempts with both timestamps known; all sampled rows remain in the table. Intervals show captured timestamps, not a claim of full workflow wall time.</p>${chart('timeline-chart', 'Sampled A, B, and Maestro observed start and finish intervals')}</div>${table('timeline-table', ['Run', 'Attempt', 'Role', 'Exact model / configuration', 'Status', 'Observed start', 'Observed finish', 'Measured execution', 'Queue delay', 'First visible text'], timelineRows, 'Sampled attempt timeline, including Maestro; omitted attempts remain in the safe source snapshot')}
    ${table('time-burden', ['Resource view', 'Summed execution time', 'Unknown timing attempts'], [['All selected-run attempt burden', duration(summary.summedExecutionMs), summary.unknownTimingCount]], 'Summed execution time is not run wall time; human waits are not model time')}
    <p class="muted small">Per-model timing plots the minimum, median, and maximum for the first 12 captured configuration groups. All known counts, unknown counts, ranges, and eligible p95 values remain in the table.</p>${chart('duration-distribution-chart', 'Per-model execution duration range and median')}${table('duration-distributions', ['Exact model / configuration', 'Role', 'Coverage', 'Known n', 'Unknown n', 'Minimum ms', 'Median ms', 'Maximum ms', 'p95 ms', 'Summed ms'], distributionRows(data.models, 'duration'), 'Execution distributions; p95 requires at least 20 known observations, a presentation threshold rather than statistical assurance')}</section>
    <section class="section" id="deltas"><div class="section-head"><h2>Matched candidate deltas</h2><p>Candidate B relative to candidate A from the same referenced run pair.</p></div><p class="muted small">Positive values mean B used more tokens or execution time than A. Zero reference values, unknown measurements, incompatible coverage, and incompatible phases suppress a delta. Unrelated cohort medians are never treated as paired evidence.</p>
    <div class="chart-controls charts-only"><label for="reference-model">Reference model in seat A</label><select class="select" id="reference-model"><option value="">All captured A reference models</option>${referenceModels.map(([key, model]) => `<option value="${escape(key)}">${escape(model)}</option>`).join('')}</select></div><p id="delta-status" class="muted small">All captured pair values and exclusions are listed below.</p>${chart('delta-chart', 'Matched candidate token and duration percentage deltas')}
    ${table('paired-deltas', ['Run', 'Judgment', 'Goal eligibility', 'Selection', 'Reference A', 'Candidate B', 'Token delta B vs A', 'Execution delta B vs A', 'Exclusions'], pairingRows, 'Matched pairs, exact reference identities, eligibility, and policy-provided deltas')}</section>
    <section class="section" id="models"><div class="section-head"><h2>Model identity & coverage</h2><p>Exact models and configurations retain separate groups.</p></div>
    ${table(
      'model-preference',
      [
        'Exact model / configuration',
        'Role',
        'Coverage',
        'Attempts',
        'Selected participations',
        'Losing participations',
        'Decisive denominator',
        'Decisive preference rate',
        'Non-decisive involvement',
        'Contributing runs',
        'Task definitions',
      ],
      data.models.map((model) => [
        modelLabel(model),
        model.role,
        model.coverage,
        model.attempts,
        model.selected,
        model.losing,
        model.preferenceDenominator,
        model.preferenceRate === null
          ? 'Unknown / ineligible'
          : `${number(model.preferenceRate * 100)}%`,
        model.involvement,
        model.runIds.join(', ') || 'None',
        model.taskHashes.join(', ') || 'Unknown',
      ]),
      'Preference uses decisive A/B outcomes between different models only; same-model and non-decisive categories are excluded from the rate',
    )}
    ${table(
      'opponent-cohorts',
      [
        'Exact model / configuration',
        'Measurement coverage',
        'Opponent exact model key',
        'Opponent configuration key',
        'Phase',
        'Selected participations',
        'Losing participations',
        'Decisive denominator',
        'Preference rate',
        'Shared eligible runs',
      ],
      data.models.flatMap((model) =>
        model.opponents.map((opponent) => [
          modelLabel(model),
          model.coverage,
          opponent.modelKey,
          opponent.configurationKey,
          label(opponent.phase),
          opponent.selected,
          opponent.losing,
          opponent.denominator,
          opponent.rate === null ? 'Unknown / ineligible' : `${number(opponent.rate * 100)}%`,
          opponent.runIds.join(', ') || 'None',
        ]),
      ),
      'Authoritative opponent cohorts for decisive preference denominators',
    )}
    ${table(
      'model-resources',
      [
        'Exact model / configuration',
        'Role',
        'Coverage',
        'Complete tokens',
        'Observed partial tokens',
        'Unknown usage attempts',
        'Configuration key',
        'Stable model key',
      ],
      data.models.map((model) => [
        modelLabel(model),
        model.role,
        model.coverage,
        model.completeTokens,
        model.observedPartialTokens,
        model.unknownUsageCount,
        model.configurationKey,
        model.modelKey,
      ]),
      'Resource totals preserve measurement scope, role, and configuration labels',
    )}
    ${table(
      'exclusions',
      ['Exclusion reason code', 'Count'],
      data.exclusions.map((exclusion) => [exclusion.code, exclusion.count]),
      'Policy exclusions; eligibility is metric-specific',
    )}
    ${data.limitations.length ? `<ul class="list muted small">${data.limitations.map((limitation) => `<li>${escape(limitation)}</li>`).join('')}</ul>` : ''}</section>
    <section class="section" id="audit"><div class="section-head"><h2>Per-run audit</h2><p>${number(data.runs.length)} source runs · open any run for its saved facts.</p></div>${table(
      'run-burden',
      [
        'Run',
        'Attempts',
        'Complete tokens',
        'Observed partial tokens',
        'Unknown usage attempts',
        'Summed execution ms',
        'Unknown timing attempts',
        'Observed interval span ms',
      ],
      data.runs.map((run) => [
        run.id,
        run.attemptCount,
        run.completeTokens,
        run.observedPartialTokens,
        run.unknownUsageCount,
        number(run.summedExecutionMs),
        run.unknownTimingCount,
        number(run.observedSpanMs),
      ]),
      'Per-run resource audit; observed interval span is not full workflow wall time',
    )}${runAudit(data)}</section>
    <section class="section" id="provenance"><div class="section-head"><h2>Snapshot provenance</h2><p>Open this HTML by itself; no application or sibling files are needed.</p></div>
    ${table(
      'provenance-table',
      ['Field', 'Captured value'],
      [
        ['Schema version', data.schemaVersion],
        ['Metric policy', data.metricPolicyVersion],
        ['Renderer version', assets.rendererVersion],
        ['Renderer build', assets.rendererBuild],
        ['Theme adapter SHA-256', assets.themeAdapterHash],
        ['Compiled CSS SHA-256', assets.cssHash],
        ['Source facts SHA-256', data.sourceFactsHash],
        ['Capture time zone', data.timeZone],
        ['Resolved source run IDs', data.resolvedRunIds.join(', ') || 'None'],
      ],
      'Reproducibility identifiers; output hashes are stored in the separate publication manifest',
    )}
    ${table(
      'dependencies',
      ['Chart dependency', 'Pinned URL', 'Subresource integrity'],
      assets.dependencies.map((dependency) => [
        dependency.name,
        dependency.url,
        dependency.integrity,
      ]),
      'Pinned chart runtime; static report content does not depend on the CDN',
    )}
    <p class="foot">Reports contain allowlisted structured outcomes and numeric telemetry. Private Maestro chat, full prompts, local paths, continuation IDs, tool arguments/results, and artifact bodies are excluded by the export contract. The report makes no provider calls and stores no browser state.</p></section></main>
    <script id="report-data" type="application/json">${json(chartData)}</script>${assets.dependencies.map((dependency) => `<script src="${escape(dependency.url)}" integrity="${escape(dependency.integrity)}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`).join('')}<script>${assets.controller}</script></body></html>`;
  if (new TextEncoder().encode(html).byteLength > REPORT_LIMITS.htmlBytes)
    throw new Error('html-size-limit');
  return { html };
}

export { reportAssets } from './render-assets.js';
