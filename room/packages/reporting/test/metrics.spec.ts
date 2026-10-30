import { describe, expect, it } from 'vitest';
import { currentSnapshotFixture, fixtureAttempt } from '../src/fixtures.js';
import { deriveReportData, distribution, normalizeUsage, pairedDelta } from '../src/metrics.js';
import { reportDataSchema } from '../src/contracts.js';
describe('provider-native snapshot normalization', () => {
  it('does not add duplicate or cumulative Codex observations and respects latest reset', () => {
    const a = fixtureAttempt('a');
    a.usage.push({ ...a.usage[0], sequence: 2, key: 'duplicate', completeness: 'partial' });
    expect(normalizeUsage(a)).toMatchObject({ total: 150, input: 100, completeness: 'complete' });
    a.usage.push({
      ...a.usage[0],
      sequence: 3,
      key: 'reset',
      source: 'codex.thread.total.counter-reset',
      scope: 'provider-cumulative',
    });
    expect(normalizeUsage(a).total).toBeNull();
  });
  it('keeps a later changed partial vector partial', () => {
    const a = fixtureAttempt('a');
    a.usage.push({
      ...a.usage[0],
      sequence: 2,
      key: 'changed',
      completeness: 'partial',
      tokens: { ...a.usage[0].tokens, inputTokens: 200 },
    });
    expect(normalizeUsage(a)).toMatchObject({ total: 250, completeness: 'partial' });
  });
  it('normalizes Claude uncached, cache-read and cache-write once; ignores cost/modelUsage', () => {
    const a = fixtureAttempt('a');
    a.provider = 'anthropic';
    a.usage[0].source = 'anthropic.result.usage';
    a.usage[0].coverage = 'main-loop';
    a.usage[0].tokens.cacheWriteInputTokens = 30;
    a.usage.push({
      ...a.usage[0],
      sequence: 2,
      key: 'cumulative',
      source: 'anthropic.result.modelUsage',
      scope: 'provider-cumulative',
      tokens: { ...a.usage[0].tokens, inputTokens: 9999 },
    });
    expect(normalizeUsage(a)).toMatchObject({
      input: 150,
      total: 200,
      output: 50,
      reasoningOutput: 10,
      coverage: 'main-loop',
    });
    a.usage[0].tokens.cacheWriteInputTokens = null;
    expect(normalizeUsage(a).input).toBeNull();
  });
  it('preserves zero and rejects unsupported source families', () => {
    const a = fixtureAttempt('a');
    a.usage[0].tokens.inputTokens = 0;
    a.usage[0].tokens.outputTokens = 0;
    expect(normalizeUsage(a).total).toBe(0);
    a.usage[0].source = 'future.provider';
    expect(normalizeUsage(a).total).toBeNull();
  });
});
describe('outcome and resource cohorts', () => {
  it('reconciles candidate pairs, burden, model preference and parallel time', () => {
    const data = reportDataSchema.parse(deriveReportData(currentSnapshotFixture()));
    expect(data.summary).toMatchObject({
      currentConfirmations: 1,
      completeTokens: 300,
      summedExecutionMs: 3000,
    });
    expect(data.runs[0].observedSpanMs).toBe(2000);
    expect(data.pairs[0]).toMatchObject({ tokenDelta: 0, durationDelta: 1 });
    expect(data.models.map((m) => m.preferenceRate).toSorted()).toEqual([0, 1]);
    expect(data.models.reduce((s, m) => s + m.completeTokens, 0)).toBe(data.summary.completeTokens);
  });
  it('counts confirmed coverage only once with a newer pending proposal', () => {
    const s = currentSnapshotFixture();
    s.runs[0].outcomes.push({ ...s.runs[0].outcomes[0], revision: 3, kind: 'proposed' });
    const d = deriveReportData(s);
    expect(d.summary).toMatchObject({
      currentConfirmations: 1,
      proposalsOnly: 0,
      pendingProposals: 1,
    });
  });
  it('keeps stale and unjudged runs in the denominator without current outcome rates', () => {
    const s = currentSnapshotFixture();
    s.runs[0].tasks.push({ ...s.runs[0].tasks[0], revision: 2 });
    s.runs.push({ ...s.runs[0], id: 'unjudged', attempts: [], outcomes: [] });
    const d = deriveReportData(s);
    expect(d.summary).toMatchObject({
      runs: 2,
      staleConfirmations: 1,
      noOutcome: 1,
      currentConfirmations: 0,
    });
    expect(d.models.every((m) => m.preferenceDenominator === 0)).toBe(true);
  });
  it.each(['tie', 'combined', 'neither', 'inconclusive'] as const)(
    'keeps %s involvement separate from wins',
    (selection) => {
      const s = currentSnapshotFixture();
      s.runs[0].outcomes[0].decision.selection = selection;
      const d = deriveReportData(s);
      expect(d.summary.selection[selection]).toBe(1);
      expect(d.models.every((m) => m.involvement === 1 && m.preferenceRate === null)).toBe(true);
    },
  );
  it('retains same-model candidates but excludes inter-model preference', () => {
    const s = currentSnapshotFixture();
    s.runs[0].attempts[1].model = 'model-alpha';
    s.runs[0].outcomes[0].candidates.b.model = 'model-alpha';
    const d = deriveReportData(s);
    expect(d.pairs).toHaveLength(1);
    expect(d.models[0].attempts).toBe(2);
    expect(d.models[0].preferenceDenominator).toBe(0);
    expect(d.pairs[0].exclusions).toContain('same-model-pair');
  });
  it('does not attribute candidates from mismatched bindings or unknown models', () => {
    const s = currentSnapshotFixture();
    s.runs[0].attempts[0].bindingId = 'new-binding';
    s.runs[0].attempts.push({
      ...fixtureAttempt('a'),
      id: 'legacy',
      turnId: 'legacy',
      provider: null,
      model: null,
    });
    const d = deriveReportData(s);
    expect(d.pairs).toHaveLength(0);
    expect(d.exclusions).toContainEqual({ code: 'unknown-model-attribution', count: 1 });
  });
  it('splits phase and coverage and suppresses incompatible pair deltas', () => {
    const s = currentSnapshotFixture();
    s.runs[0].attempts[1].phase = 'discussion';
    s.runs[0].attempts[1].usage[0].coverage = 'main-loop';
    const d = deriveReportData(s);
    expect(d.models).toHaveLength(2);
    expect(d.pairs[0]).toMatchObject({ tokenDelta: null, durationDelta: null });
    expect(d.pairs[0].exclusions).toContain('coverage-mismatch');
  });
  it('keeps failure/retry/maestro burden and partial usage outside complete sums', () => {
    const s = currentSnapshotFixture();
    s.runs[0].attempts.push({
      ...fixtureAttempt('a'),
      id: 'retry',
      turnId: 'retry',
      role: 'maestro',
      status: 'failed',
      usage: [{ ...fixtureAttempt('a').usage[0], completeness: 'partial' }],
      elapsedMs: null,
    });
    const d = deriveReportData(s);
    expect(d.summary).toMatchObject({
      completeTokens: 300,
      observedPartialTokens: 150,
      unknownTimingCount: 1,
    });
    expect(d.models.some((m) => m.role === 'maestro')).toBe(true);
  });
  it('rejects unavailable historical metric policies', () =>
    expect(() =>
      deriveReportData(currentSnapshotFixture(), { version: 'old', sourceFactsHash: 'x' }),
    ).toThrow('unsupported-metric-policy'));
});
describe('sample policy', () => {
  it('uses median and nearest-rank p95 only at n>=20', () => {
    expect(distribution([1, 2, 3, 4, null])).toMatchObject({
      count: 4,
      unknown: 1,
      median: 2.5,
      p95: null,
      sum: 10,
    });
    expect(distribution(Array.from({ length: 20 }, (_, i) => i + 1)).p95).toBe(19);
    expect(pairedDelta(2, 0)).toBeNull();
    expect(pairedDelta(null, 1)).toBeNull();
  });
});

describe('aggregate eligibility and timeline bounds', () => {
  it('keeps proposal and stale pair evidence out of aggregate paired comparisons', () => {
    const snapshot = currentSnapshotFixture();
    snapshot.selection = { kind: 'manual', runIds: snapshot.resolvedRunIds };
    snapshot.runs[0].outcomes[0].kind = 'proposed';
    expect(deriveReportData(snapshot).pairs).toHaveLength(0);
    snapshot.runs[0].outcomes[0].kind = 'confirmed';
    snapshot.runs[0].tasks.push({ ...snapshot.runs[0].tasks[0], revision: 2 });
    expect(deriveReportData(snapshot).pairs).toHaveLength(0);
  });
  it('samples chart rows explicitly without changing statistics and rejects invalid observed spans', () => {
    const snapshot = currentSnapshotFixture();
    snapshot.runs[0].attempts = Array.from({ length: 1200 }, (_, i) => ({
      ...fixtureAttempt('a'),
      id: 'attempt-' + i,
      turnId: 'attempt-' + i,
      startedAt: 30,
      finishedAt: 20,
    }));
    const data = deriveReportData(snapshot);
    expect(data.timeline).toMatchObject({ totalAttempts: 1200, omittedAttempts: 200 });
    expect(data.timeline.attempts).toHaveLength(1000);
    expect(data.summary.completeTokens).toBe(180000);
    expect(data.runs[0].observedSpanMs).toBeNull();
  });
});
