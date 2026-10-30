import { deriveReportData } from './metrics.js';
import {
  reportDataSchema,
  reportSnapshotSchema,
  type ReportData,
  type ReportSnapshot,
  type ReportAttempt,
} from './contracts.js';
const now = 1793318400000;
const tokens = {
  inputTokens: 100,
  cachedInputTokens: 20,
  cacheWriteInputTokens: 0,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  totalTokens: 150,
};
export function fixtureAttempt(role: 'a' | 'b', runId = 'fixture-run'): ReportAttempt {
  return {
    id: `${runId}-${role}`,
    turnId: `${runId}-${role}`,
    bindingId: `${runId}-binding-${role}`,
    role,
    provider: 'codex',
    model: role === 'a' ? 'model-alpha' : 'model-beta',
    effort: 'high',
    instructionsVersion: 'room-v1',
    toolPolicyVersion: 1,
    toolProfile: 'analysis',
    configRevision: 1,
    taskRevision: 1,
    phase: 'independent',
    trigger: 'manual',
    origin: 'accepted',
    originalAuthor: null,
    attributionSource: 'recorded-binding',
    parentTurnId: null,
    retryOf: null,
    requestedAt: now,
    startedAt: now + 10,
    firstTextAt: now + 20,
    finishedAt: now + (role === 'a' ? 1010 : 2010),
    elapsedMs: role === 'a' ? 1000 : 2000,
    status: 'completed',
    usage: [
      {
        sequence: 1,
        observedAt: now + 2010,
        key: 'usage',
        source: 'codex.thread.total',
        scope: 'turn',
        coverage: 'all-model-calls',
        completeness: 'complete',
        requestedModel: role === 'a' ? 'model-alpha' : 'model-beta',
        actualModel: null,
        tokens: { ...tokens },
        providerDurationMs: null,
      },
    ],
    tools: [],
  };
}
export function currentSnapshotFixture(): ReportSnapshot {
  const a = fixtureAttempt('a'),
    b = fixtureAttempt('b');
  return reportSnapshotSchema.parse({
    schemaVersion: 1,
    generationId: 'fixture-generation',
    anchorRunId: 'fixture-run',
    capturedAt: now + 10000,
    timeZone: 'UTC',
    selection: { kind: 'current' },
    resolvedRunIds: ['fixture-run'],
    runs: [
      {
        id: 'fixture-run',
        createdAt: now,
        kind: 'ordinary',
        state: 'ready',
        revision: 1,
        tasks: [
          {
            revision: 1,
            question: 'Synthetic comparison fixture',
            criteria: ['Explain the result'],
            mode: 'reasoning',
            profile: 'analysis',
            expectedArtifact: '',
            sourceRevision: null,
            definitionHash: 'fixture-task-hash',
            origin: 'draft-save',
            createdAt: now,
          },
        ],
        attempts: [a, b],
        outcomes: [
          {
            revision: 2,
            kind: 'confirmed',
            proposalRevision: 1,
            sourceMaestroTurnId: 'fixture-maestro',
            taskRevision: 1,
            decision: {
              selection: 'a',
              goalStatus: 'partial',
              summary: 'Synthetic fixture, not measured model performance.',
              criteria: [{ index: 0, result: 'partially-met', evidence: 'Fixture evidence' }],
            },
            candidates: {
              a: {
                turnId: a.turnId,
                bindingId: a.bindingId,
                provider: a.provider,
                model: a.model,
                sha256: 'a'.repeat(64),
              },
              b: {
                turnId: b.turnId,
                bindingId: b.bindingId,
                provider: b.provider,
                model: b.model,
                sha256: 'b'.repeat(64),
              },
            },
            createdAt: now + 5000,
          },
        ],
      },
    ],
  });
}
export function currentReportFixture(): ReportData {
  return reportDataSchema.parse(
    deriveReportData(currentSnapshotFixture(), {
      version: '1.0.0',
      sourceFactsHash: 'synthetic-fixture',
    }),
  );
}
export function aggregateReportFixture(): ReportData {
  const snapshot = currentSnapshotFixture();
  snapshot.selection = { kind: 'manual', runIds: ['fixture-run', 'fixture-unjudged'] };
  snapshot.resolvedRunIds.push('fixture-unjudged');
  snapshot.runs.push({ ...snapshot.runs[0], id: 'fixture-unjudged', attempts: [], outcomes: [] });
  return reportDataSchema.parse(
    deriveReportData(snapshot, {
      version: '1.0.0',
      sourceFactsHash: 'synthetic-aggregate-fixture',
    }),
  );
}
