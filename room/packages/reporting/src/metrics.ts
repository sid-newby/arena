import {
  METRIC_POLICY_VERSION,
  type AttemptMetric,
  type ModelMetric,
  type NormalizedUsage,
  type ReportAttempt,
  type ReportData,
  type ReportSnapshot,
  type UsageObservation,
} from './contracts.js';

const unknownUsage = (): NormalizedUsage => ({
  input: null,
  output: null,
  cachedInput: null,
  cacheWriteInput: null,
  reasoningOutput: null,
  total: null,
  source: null,
  coverage: 'unknown',
  completeness: 'unknown',
  actualModel: null,
});
export function normalizeUsage(attempt: ReportAttempt): NormalizedUsage {
  const observations = attempt.usage
    .filter((o) =>
      attempt.provider === 'codex'
        ? o.source === 'codex.thread.total' || o.source === 'codex.thread.total.counter-reset'
        : attempt.provider === 'anthropic' && o.source === 'anthropic.result.usage',
    )
    .toSorted((a, b) => a.sequence - b.sequence);
  const latest = observations.at(-1);
  if (!latest) return unknownUsage();
  const base = {
    ...unknownUsage(),
    source: latest.source,
    coverage: latest.coverage,
    actualModel: latest.actualModel,
  };
  if (latest.scope !== 'turn' || latest.source.endsWith('counter-reset')) return base;
  const sameVector = (o: UsageObservation) =>
    JSON.stringify(o.tokens) === JSON.stringify(latest.tokens);
  const completeness =
    latest.completeness === 'complete' ||
    observations.some(
      (o) =>
        o.scope === 'turn' &&
        o.coverage === latest.coverage &&
        o.completeness === 'complete' &&
        sameVector(o),
    )
      ? 'complete'
      : latest.completeness;
  const t = latest.tokens;
  const input =
    attempt.provider === 'anthropic'
      ? t.inputTokens !== null && t.cachedInputTokens !== null && t.cacheWriteInputTokens !== null
        ? t.inputTokens + t.cachedInputTokens + t.cacheWriteInputTokens
        : null
      : t.inputTokens;
  return {
    ...base,
    input,
    output: t.outputTokens,
    cachedInput: t.cachedInputTokens,
    cacheWriteInput: t.cacheWriteInputTokens,
    reasoningOutput: t.reasoningOutputTokens,
    total: input !== null && t.outputTokens !== null ? input + t.outputTokens : null,
    completeness,
  };
}
export function distribution(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null).toSorted((a, b) => a - b),
    n = known.length;
  return {
    count: n,
    unknown: values.length - n,
    sum: known.reduce((a, b) => a + b, 0),
    median: n ? (known[Math.floor((n - 1) / 2)] + known[Math.floor(n / 2)]) / 2 : null,
    min: known[0] ?? null,
    max: known.at(-1) ?? null,
    p95: n >= 20 ? known[Math.ceil(0.95 * n) - 1] : null,
  };
}
const difference = (start: number | null, end: number | null) =>
  start !== null && end !== null && end >= start ? end - start : null;
export const pairedDelta = (candidate: number | null, reference: number | null) =>
  candidate !== null && reference !== null && reference > 0
    ? (candidate - reference) / reference
    : null;
const modelKey = (a: ReportAttempt) =>
  a.provider && a.model ? JSON.stringify([a.provider, a.model]) : null;
const configurationKey = (a: ReportAttempt) =>
  modelKey(a)
    ? JSON.stringify([
        a.provider,
        a.model,
        a.effort,
        a.instructionsVersion,
        a.toolPolicyVersion,
        a.toolProfile,
      ])
    : null;
function metric(a: ReportAttempt, runId: string): AttemptMetric {
  return {
    id: a.id,
    runId,
    role: a.role,
    modelKey: modelKey(a),
    configurationKey: configurationKey(a),
    model: a.model,
    provider: a.provider,
    effort: a.effort,
    toolProfile: a.toolProfile,
    phase: a.phase,
    taskRevision: a.taskRevision,
    status: a.status,
    usage: normalizeUsage(a),
    elapsedMs: a.elapsedMs,
    queueMs: difference(a.requestedAt, a.startedAt),
    firstTextMs: difference(a.startedAt, a.firstTextAt),
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
  };
}
const groupKey = (m: AttemptMetric) =>
  JSON.stringify([
    m.configurationKey,
    m.phase,
    m.usage.coverage,
    m.role === 'maestro' ? 'maestro' : 'candidate',
  ]);
export function deriveReportData(
  snapshot: ReportSnapshot,
  policy: { version: string; sourceFactsHash: string } = {
    version: METRIC_POLICY_VERSION,
    sourceFactsHash: '',
  },
): ReportData {
  if (policy.version !== METRIC_POLICY_VERSION) throw new Error('unsupported-metric-policy');
  const summary: ReportData['summary'] = {
    runs: snapshot.runs.length,
    attempts: 0,
    currentConfirmations: 0,
    staleConfirmations: 0,
    proposalsOnly: 0,
    noOutcome: 0,
    pendingProposals: 0,
    selection: { a: 0, b: 0, tie: 0, combined: 0, neither: 0, inconclusive: 0 },
    goalStatus: { solved: 0, partial: 0, unresolved: 0, 'awaiting-validation': 0 },
    completeTokens: 0,
    observedPartialTokens: 0,
    unknownUsageCount: 0,
    summedExecutionMs: 0,
    unknownTimingCount: 0,
  };
  const groups = new Map<string, { row: ModelMetric; attempts: AttemptMetric[] }>();
  const exclusions = new Map<string, number>();
  const exclude = (code: string) => exclusions.set(code, (exclusions.get(code) ?? 0) + 1);
  const timelineAttempts: AttemptMetric[] = [];
  const pairs: ReportData['pairs'] = [];
  const runs: ReportData['runs'] = [];
  for (const run of snapshot.runs) {
    const task = run.tasks.at(-1) ?? null;
    const confirmation = run.outcomes.findLast((o) => o.kind === 'confirmed');
    const proposal = run.outcomes.findLast((o) => o.kind === 'proposed');
    const outcome = confirmation ?? proposal ?? null;
    const current = Boolean(confirmation && task && confirmation.taskRevision === task.revision);
    const coverage = current
      ? 'current-confirmation'
      : confirmation
        ? 'stale-confirmation'
        : proposal
          ? 'proposal-only'
          : 'no-outcome';
    if (current) {
      summary.currentConfirmations++;
      summary.selection[confirmation!.decision.selection]++;
      summary.goalStatus[confirmation!.decision.goalStatus]++;
    } else if (confirmation) summary.staleConfirmations++;
    else if (proposal) summary.proposalsOnly++;
    else summary.noOutcome++;
    const pendingProposal = Boolean(
      proposal && (!confirmation || proposal.revision > confirmation.revision),
    );
    if (pendingProposal) summary.pendingProposals++;
    const attempts = run.attempts.map((a) => metric(a, run.id));
    timelineAttempts.push(...attempts);
    const byTurn = new Map(run.attempts.map((a, i) => [a.turnId, attempts[i]]));
    let completeTokens = 0,
      observedPartialTokens = 0,
      unknownUsageCount = 0,
      summedExecutionMs = 0,
      unknownTimingCount = 0;
    for (const m of attempts) {
      if (m.usage.total === null || m.usage.completeness === 'unknown') unknownUsageCount++;
      else if (m.usage.completeness === 'complete') completeTokens += m.usage.total;
      else observedPartialTokens += m.usage.total;
      if (m.elapsedMs === null) unknownTimingCount++;
      else summedExecutionMs += m.elapsedMs;
      if (!m.modelKey || !m.configurationKey || !m.model || !m.provider) {
        exclude('unknown-model-attribution');
        continue;
      }
      const key = groupKey(m);
      let group = groups.get(key);
      if (!group) {
        group = {
          row: {
            key,
            modelKey: m.modelKey,
            configurationKey: m.configurationKey,
            provider: m.provider,
            model: m.model,
            effort: m.effort,
            toolProfile: m.toolProfile,
            phase: m.phase,
            coverage: m.usage.coverage,
            role: m.role === 'maestro' ? 'maestro' : 'candidate',
            attempts: 0,
            completeTokens: 0,
            observedPartialTokens: 0,
            unknownUsageCount: 0,
            tokens: distribution([]),
            duration: distribution([]),
            selected: 0,
            losing: 0,
            preferenceDenominator: 0,
            preferenceRate: null,
            opponents: [],
            involvement: 0,
            runIds: [],
            taskHashes: [],
          },
          attempts: [],
        };
        groups.set(key, group);
      }
      group.attempts.push(m);
      const row = group.row;
      row.attempts++;
      if (m.usage.total === null || m.usage.completeness === 'unknown') row.unknownUsageCount++;
      else if (m.usage.completeness === 'complete') row.completeTokens += m.usage.total;
      else row.observedPartialTokens += m.usage.total;
      if (!row.runIds.includes(run.id)) row.runIds.push(run.id);
      const hash = run.tasks.find((t) => t.revision === m.taskRevision)?.definitionHash;
      if (hash && !row.taskHashes.includes(hash)) row.taskHashes.push(hash);
    }
    const warnings: string[] = [];
    if (coverage === 'stale-confirmation') warnings.push('stale-confirmation');
    if (outcome && (current || snapshot.selection.kind === 'current')) {
      const a = byTurn.get(outcome.candidates.a.turnId),
        b = byTurn.get(outcome.candidates.b.turnId);
      const sourceA = run.attempts.find((v) => v.turnId === outcome.candidates.a.turnId),
        sourceB = run.attempts.find((v) => v.turnId === outcome.candidates.b.turnId);
      const exact = (
        s: ReportAttempt | undefined,
        c: typeof outcome.candidates.a,
        role: 'a' | 'b',
      ) =>
        s &&
        s.role === role &&
        s.bindingId === c.bindingId &&
        s.provider === c.provider &&
        s.model === c.model &&
        s.status === 'completed';
      if (
        a &&
        b &&
        exact(sourceA, outcome.candidates.a, 'a') &&
        exact(sourceB, outcome.candidates.b, 'b')
      ) {
        const reasons: string[] = [];
        if (!current) reasons.push('not-current-confirmation');
        if (a.taskRevision !== outcome.taskRevision || b.taskRevision !== outcome.taskRevision)
          reasons.push('candidate-task-mismatch');
        if (a.phase !== b.phase || a.phase === null) reasons.push('phase-mismatch');
        if (
          sourceA!.effort !== sourceB!.effort ||
          sourceA!.toolProfile !== sourceB!.toolProfile ||
          sourceA!.instructionsVersion !== sourceB!.instructionsVersion ||
          sourceA!.toolPolicyVersion !== sourceB!.toolPolicyVersion
        )
          reasons.push('configuration-mismatch');
        if (a.usage.coverage !== b.usage.coverage || a.usage.coverage === 'unknown')
          reasons.push('coverage-mismatch');
        if (a.modelKey === b.modelKey) reasons.push('same-model-pair');
        const compatible = !reasons.some((r) =>
          [
            'candidate-task-mismatch',
            'phase-mismatch',
            'configuration-mismatch',
            'coverage-mismatch',
          ].includes(r),
        );
        const complete = a.usage.completeness === 'complete' && b.usage.completeness === 'complete';
        const tokenDelta =
          compatible && complete ? pairedDelta(b.usage.total, a.usage.total) : null;
        const durationDelta = compatible ? pairedDelta(b.elapsedMs, a.elapsedMs) : null;
        if (!complete) reasons.push('incomplete-usage');
        if (a.usage.total === 0 || a.elapsedMs === 0) reasons.push('zero-reference');
        pairs.push({
          runId: run.id,
          confirmed: outcome.kind === 'confirmed',
          currentTask: current,
          a,
          b,
          selection: outcome.decision.selection,
          tokenDelta,
          durationDelta,
          exclusions: reasons,
        });
        warnings.push(...reasons);
        reasons.forEach(exclude);
        if (current && a.modelKey && b.modelKey) {
          const ar = groups.get(groupKey(a))?.row,
            br = groups.get(groupKey(b))?.row;
          if (ar && br) {
            if (
              (outcome.decision.selection === 'a' || outcome.decision.selection === 'b') &&
              a.modelKey !== b.modelKey &&
              !reasons.includes('candidate-task-mismatch')
            ) {
              const winner = outcome.decision.selection === 'a' ? ar : br,
                loser = outcome.decision.selection === 'a' ? br : ar;
              winner.selected++;
              loser.losing++;
              for (const [row, opponent, won] of [
                [ar, b, outcome.decision.selection === 'a'],
                [br, a, outcome.decision.selection === 'b'],
              ] as const) {
                let entry = row.opponents.find(
                  (o) =>
                    o.configurationKey === opponent.configurationKey && o.phase === opponent.phase,
                );
                if (!entry) {
                  entry = {
                    modelKey: opponent.modelKey!,
                    configurationKey: opponent.configurationKey!,
                    phase: opponent.phase,
                    selected: 0,
                    losing: 0,
                    denominator: 0,
                    rate: null,
                    runIds: [],
                  };
                  row.opponents.push(entry);
                }
                if (won) entry.selected++;
                else entry.losing++;
                entry.denominator++;
                entry.rate = entry.selected / entry.denominator;
                entry.runIds.push(run.id);
              }
            } else if (outcome.decision.selection !== 'a' && outcome.decision.selection !== 'b') {
              ar.involvement++;
              br.involvement++;
            }
          }
        }
      } else {
        warnings.push('candidate-attempt-unavailable');
        exclude('candidate-attempt-unavailable');
      }
    }
    const intervals = attempts.filter(
      (a) => a.startedAt !== null && a.finishedAt !== null && a.finishedAt >= a.startedAt,
    );
    const starts = intervals.map((a) => a.startedAt!),
      ends = intervals.map((a) => a.finishedAt!);
    runs.push({
      id: run.id,
      createdAt: run.createdAt,
      task,
      coverage,
      pendingProposal,
      incomplete:
        !current || attempts.some((a) => a.status === 'running' || a.status === 'interrupted'),
      outcome,
      attemptCount: attempts.length,
      completeTokens,
      observedPartialTokens,
      unknownUsageCount,
      summedExecutionMs,
      unknownTimingCount,
      observedSpanMs: starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : null,
      warnings: [...new Set(warnings)],
    });
    summary.attempts += attempts.length;
    summary.completeTokens += completeTokens;
    summary.observedPartialTokens += observedPartialTokens;
    summary.unknownUsageCount += unknownUsageCount;
    summary.summedExecutionMs += summedExecutionMs;
    summary.unknownTimingCount += unknownTimingCount;
  }
  const models = [...groups.values()]
    .map(({ row, attempts }) => ({
      ...row,
      tokens: distribution(
        attempts.map((a) => (a.usage.completeness === 'complete' ? a.usage.total : null)),
      ),
      duration: distribution(attempts.map((a) => a.elapsedMs)),
      preferenceDenominator: row.selected + row.losing,
      preferenceRate: row.selected + row.losing ? row.selected / (row.selected + row.losing) : null,
    }))
    .toSorted((a, b) => a.key.localeCompare(b.key));
  const timelineSample =
    timelineAttempts.length <= 1000
      ? timelineAttempts
      : Array.from(
          { length: 1000 },
          (_, i) => timelineAttempts[Math.floor((i * (timelineAttempts.length - 1)) / 999)],
        );
  return {
    timeline: {
      attempts: timelineSample,
      totalAttempts: timelineAttempts.length,
      omittedAttempts: timelineAttempts.length - timelineSample.length,
    },
    schemaVersion: 1,
    metricPolicyVersion: policy.version,
    generationId: snapshot.generationId,
    anchorRunId: snapshot.anchorRunId,
    capturedAt: snapshot.capturedAt,
    timeZone: snapshot.timeZone,
    selection: snapshot.selection,
    resolvedRunIds: snapshot.resolvedRunIds,
    sourceFactsHash: policy.sourceFactsHash,
    observational: true,
    summary,
    runs,
    models,
    pairs,
    exclusions: [...exclusions]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([code, count]) => ({ code, count })),
    limitations: [
      'Observational results; task hashes do not establish matched difficulty or controlled conditions.',
      'Goal status and criterion assessments belong to the shared decision, not individual models.',
      'Summed execution time includes overlapping work and is not run wall time.',
      'Partial token sums are observed usage; missing usage is unknown, not zero.',
      'Candidate deltas use A as the reference and B as the candidate; incompatible pairs are excluded.',
      'Model rows split configuration, phase, coverage, and Maestro work.',
    ],
  };
}
