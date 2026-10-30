import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const METRIC_POLICY_VERSION = '1.0.0';
export const REPORT_LIMITS = {
  runs: 1000,
  attempts: 50000,
  htmlBytes: 5 * 1024 * 1024,
  queued: 8,
} as const;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const count = z.number().finite().nonnegative();
const nullableCount = count.nullable();
const timestamp = z.number().int().nonnegative();
const text = z.string();
export const reportSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('current') }).strict(),
  z
    .object({ kind: z.literal('manual'), runIds: z.array(id).min(1).max(REPORT_LIMITS.runs) })
    .strict(),
  z
    .object({
      kind: z.literal('date-range'),
      fromInclusive: z.iso.datetime({ offset: true }),
      toExclusive: z.iso.datetime({ offset: true }),
      timeZone: z.string().min(1).max(100),
      excludeRunIds: z.array(id).max(REPORT_LIMITS.runs),
    })
    .strict()
    .refine(
      (v) => Date.parse(v.fromInclusive) < Date.parse(v.toExclusive),
      'Date interval must be increasing',
    )
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v.timeZone }).resolvedOptions();
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone'),
]);
export const reportRequestSchema = z
  .object({ requestId: id.min(8), selection: reportSelectionSchema })
  .strict();
export type ReportSelection = z.infer<typeof reportSelectionSchema>;
export type ReportRequest = z.infer<typeof reportRequestSchema>;
export const reportSourcesSchema = z.array(
  z
    .object({
      runId: id,
      models: z.array(z.object({ provider: text.min(1), model: text.min(1) }).strict()),
    })
    .strict(),
);
export type ReportSources = z.infer<typeof reportSourcesSchema>;
export const tokensSchema = z
  .object({
    inputTokens: nullableCount,
    cachedInputTokens: nullableCount,
    cacheWriteInputTokens: nullableCount,
    outputTokens: nullableCount,
    reasoningOutputTokens: nullableCount,
    totalTokens: nullableCount,
  })
  .strict();
export const usageSchema = z
  .object({
    sequence: count,
    observedAt: timestamp,
    key: text,
    source: text,
    scope: z.enum(['turn', 'provider-cumulative', 'unknown']),
    coverage: z.enum(['main-loop', 'all-model-calls', 'unknown']),
    completeness: z.enum(['complete', 'partial', 'unknown']),
    requestedModel: text,
    actualModel: text.nullable(),
    tokens: tokensSchema,
    providerDurationMs: nullableCount,
  })
  .strict();
export const taskSchema = z
  .object({
    revision: count,
    question: text,
    criteria: z.array(text),
    mode: z.enum(['reasoning', 'prototype']),
    profile: z.enum(['analysis', 'build']),
    expectedArtifact: text,
    sourceRevision: text.nullable(),
    definitionHash: text,
    origin: text,
    createdAt: timestamp,
  })
  .strict();
export const candidateSchema = z
  .object({ turnId: id, bindingId: id, provider: text, model: text, sha256: text })
  .strict();
export const decisionSchema = z
  .object({
    selection: z.enum(['a', 'b', 'tie', 'combined', 'neither', 'inconclusive']),
    goalStatus: z.enum(['solved', 'partial', 'unresolved', 'awaiting-validation']),
    summary: text,
    criteria: z.array(
      z
        .object({
          index: count,
          result: z.enum(['met', 'partially-met', 'not-met', 'unknown']),
          evidence: text,
        })
        .strict(),
    ),
  })
  .strict();
export const outcomeSchema = z
  .object({
    revision: count,
    kind: z.enum(['proposed', 'confirmed']),
    proposalRevision: count.nullable(),
    sourceMaestroTurnId: id,
    taskRevision: count,
    decision: decisionSchema,
    candidates: z.object({ a: candidateSchema, b: candidateSchema }).strict(),
    createdAt: timestamp,
  })
  .strict();
export const attemptSchema = z
  .object({
    id,
    turnId: id,
    bindingId: id.nullable(),
    role: z.enum(['a', 'b', 'maestro']),
    provider: text.nullable(),
    model: text.nullable(),
    effort: text.nullable(),
    instructionsVersion: text.nullable(),
    toolPolicyVersion: count.nullable(),
    toolProfile: text.nullable(),
    configRevision: count.nullable(),
    taskRevision: count.nullable(),
    phase: text.nullable(),
    trigger: text,
    origin: text,
    originalAuthor: text.nullable(),
    attributionSource: text,
    parentTurnId: text.nullable(),
    retryOf: text.nullable(),
    requestedAt: timestamp.nullable(),
    startedAt: timestamp.nullable(),
    firstTextAt: timestamp.nullable(),
    finishedAt: timestamp.nullable(),
    elapsedMs: nullableCount,
    status: z.enum(['running', 'completed', 'failed', 'stopped', 'interrupted']),
    usage: z.array(usageSchema),
    tools: z.array(
      z
        .object({
          id: text,
          name: text,
          status: text,
          startedAt: timestamp,
          finishedAt: timestamp.nullable(),
          elapsedMs: nullableCount,
        })
        .strict(),
    ),
  })
  .strict();
export const runSchema = z
  .object({
    id,
    createdAt: timestamp,
    kind: z.enum(['ordinary', 'legacy']),
    state: z.enum(['ready', 'retained', 'interrupted']),
    revision: count,
    tasks: z.array(taskSchema),
    attempts: z.array(attemptSchema),
    outcomes: z.array(outcomeSchema),
  })
  .strict();
export const reportSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    generationId: id,
    anchorRunId: id,
    capturedAt: timestamp,
    timeZone: text,
    selection: reportSelectionSchema,
    resolvedRunIds: z.array(id).max(REPORT_LIMITS.runs),
    runs: z.array(runSchema).max(REPORT_LIMITS.runs),
  })
  .strict();
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type ReportAttempt = z.infer<typeof attemptSchema>;
export type ReportRun = z.infer<typeof runSchema>;
export type UsageObservation = z.infer<typeof usageSchema>;
const distributionSchema = z
  .object({
    count,
    unknown: count,
    sum: count,
    median: nullableCount,
    min: nullableCount,
    max: nullableCount,
    p95: nullableCount,
  })
  .strict();
export const normalizedUsageSchema = z
  .object({
    input: nullableCount,
    output: nullableCount,
    cachedInput: nullableCount,
    cacheWriteInput: nullableCount,
    reasoningOutput: nullableCount,
    total: nullableCount,
    source: text.nullable(),
    coverage: z.enum(['main-loop', 'all-model-calls', 'unknown']),
    completeness: z.enum(['complete', 'partial', 'unknown']),
    actualModel: text.nullable(),
  })
  .strict();
export const attemptMetricSchema = z
  .object({
    id,
    runId: id,
    role: z.enum(['a', 'b', 'maestro']),
    modelKey: text.nullable(),
    configurationKey: text.nullable(),
    model: text.nullable(),
    provider: text.nullable(),
    effort: text.nullable(),
    toolProfile: text.nullable(),
    phase: text.nullable(),
    taskRevision: count.nullable(),
    status: text,
    usage: normalizedUsageSchema,
    elapsedMs: nullableCount,
    queueMs: nullableCount,
    firstTextMs: nullableCount,
    startedAt: timestamp.nullable(),
    finishedAt: timestamp.nullable(),
  })
  .strict();
export const runMetricSchema = z
  .object({
    id,
    createdAt: timestamp,
    task: taskSchema.nullable(),
    coverage: z.enum(['current-confirmation', 'stale-confirmation', 'proposal-only', 'no-outcome']),
    pendingProposal: z.boolean(),
    incomplete: z.boolean(),
    outcome: outcomeSchema.nullable(),
    attemptCount: count,
    completeTokens: count,
    observedPartialTokens: count,
    unknownUsageCount: count,
    summedExecutionMs: count,
    unknownTimingCount: count,
    observedSpanMs: nullableCount,
    warnings: z.array(text),
  })
  .strict();
export const modelMetricSchema = z
  .object({
    key: text,
    modelKey: text,
    configurationKey: text,
    provider: text,
    model: text,
    effort: text.nullable(),
    toolProfile: text.nullable(),
    phase: text.nullable(),
    coverage: z.enum(['main-loop', 'all-model-calls', 'unknown']),
    role: z.enum(['candidate', 'maestro']),
    attempts: count,
    completeTokens: count,
    observedPartialTokens: count,
    unknownUsageCount: count,
    tokens: distributionSchema,
    duration: distributionSchema,
    selected: count,
    losing: count,
    preferenceDenominator: count,
    preferenceRate: nullableCount,
    opponents: z.array(
      z
        .object({
          modelKey: text,
          configurationKey: text,
          phase: text.nullable(),
          selected: count,
          losing: count,
          denominator: count,
          rate: nullableCount,
          runIds: z.array(id),
        })
        .strict(),
    ),
    involvement: count,
    runIds: z.array(id),
    taskHashes: z.array(text),
  })
  .strict();
export const pairSchema = z
  .object({
    runId: id,
    confirmed: z.boolean(),
    currentTask: z.boolean(),
    a: attemptMetricSchema,
    b: attemptMetricSchema,
    selection: decisionSchema.shape.selection,
    tokenDelta: z.number().finite().nullable(),
    durationDelta: z.number().finite().nullable(),
    exclusions: z.array(text),
  })
  .strict();
export const reportDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    metricPolicyVersion: text,
    generationId: id,
    anchorRunId: id,
    capturedAt: timestamp,
    timeZone: text,
    selection: reportSelectionSchema,
    resolvedRunIds: z.array(id),
    sourceFactsHash: text,
    timeline: z
      .object({
        attempts: z.array(attemptMetricSchema),
        totalAttempts: count,
        omittedAttempts: count,
      })
      .strict(),
    observational: z.literal(true),
    summary: z
      .object({
        runs: count,
        attempts: count,
        currentConfirmations: count,
        staleConfirmations: count,
        proposalsOnly: count,
        noOutcome: count,
        pendingProposals: count,
        selection: z.record(decisionSchema.shape.selection, count),
        goalStatus: z.record(decisionSchema.shape.goalStatus, count),
        completeTokens: count,
        observedPartialTokens: count,
        unknownUsageCount: count,
        summedExecutionMs: count,
        unknownTimingCount: count,
      })
      .strict(),
    runs: z.array(runMetricSchema),
    models: z.array(modelMetricSchema),
    pairs: z.array(pairSchema),
    exclusions: z.array(z.object({ code: text, count }).strict()),
    limitations: z.array(text),
  })
  .strict();
export type ReportData = z.infer<typeof reportDataSchema>;
export type AttemptMetric = z.infer<typeof attemptMetricSchema>;
export type NormalizedUsage = z.infer<typeof normalizedUsageSchema>;
export type ModelMetric = z.infer<typeof modelMetricSchema>;
export interface ReportAssets {
  rendererVersion: string;
  rendererBuild: string;
  themeAdapterHash: string;
  cssHash: string;
  css: string;
  controller: string;
  dependencies: { name: string; url: string; integrity: string }[];
}
export interface RenderedReport {
  html: string;
}
export type ReportRenderer = (data: ReportData, assets: ReportAssets) => RenderedReport;
const generationBase = {
  id,
  anchorRunId: id,
  requestId: id,
  createdAt: timestamp,
  selection: reportSelectionSchema,
  resolvedRunIds: z.array(id),
};
export const reportGenerationSchema = z.discriminatedUnion('status', [
  z.object({ ...generationBase, status: z.literal('queued') }).strict(),
  z.object({ ...generationBase, status: z.literal('building') }).strict(),
  z
    .object({
      ...generationBase,
      status: z.literal('ready'),
      capturedAt: timestamp,
      manifestHash: text,
      previewUrl: text,
      downloadUrl: text,
    })
    .strict(),
  z.object({ ...generationBase, status: z.literal('failed'), errorCode: text }).strict(),
]);
export type ReportGeneration = z.infer<typeof reportGenerationSchema>;
export const reportListSchema = z
  .object({ generations: z.array(reportGenerationSchema), nextBefore: text.nullable() })
  .strict();
export type ReportList = z.infer<typeof reportListSchema>;
export const reportManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generationId: id,
    anchorRunId: id,
    capturedAt: timestamp,
    timeZone: text,
    selection: reportSelectionSchema,
    resolvedRunIds: z.array(id),
    metricPolicyVersion: text,
    rendererVersion: text,
    rendererBuild: text,
    themeAdapterHash: text,
    cssHash: text,
    dependencies: z.array(z.object({ name: text, url: text, integrity: text }).strict()),
    sourceFactsHash: text,
    fingerprint: text,
    sourceRevisions: z.array(
      z
        .object({ runId: id, taskRevisions: z.array(count), outcomeRevisions: z.array(count) })
        .strict(),
    ),
    files: z
      .object({ 'index.html': text, 'snapshot.json': text, 'report-data.json': text })
      .strict(),
    exclusions: z.array(z.object({ code: text, count }).strict()),
  })
  .strict();
export type ReportManifest = z.infer<typeof reportManifestSchema>;
