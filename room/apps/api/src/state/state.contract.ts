import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const decisionSchema = z
  .object({
    selection: z.enum(['a', 'b', 'tie', 'combined', 'neither', 'inconclusive']),
    goalStatus: z.enum(['solved', 'partial', 'unresolved', 'awaiting-validation']),
    summary: z.string().trim().min(1).max(4000),
    criteria: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            result: z.enum(['met', 'partially-met', 'not-met', 'unknown']),
            evidence: z.string().max(2000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type Decision = z.infer<typeof decisionSchema>;
export const proposalSchema = z
  .object({
    taskRevision: z.number().int().positive(),
    candidateTurnIds: z
      .object({ a: z.string().min(1).max(128), b: z.string().min(1).max(128) })
      .strict(),
    decision: decisionSchema,
  })
  .strict();
export const confirmationSchema = z
  .object({
    requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
    expectedRevision: z.number().int().nonnegative(),
    decision: decisionSchema,
  })
  .strict();
export function parseStateInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      'Invalid state command: ' +
        result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  return result.data;
}
export interface CandidateEvidence {
  turnId: string;
  bindingId: string;
  provider: string;
  model: string;
  sha256: string;
}
export interface OutcomeRevision {
  revision: number;
  kind: 'proposed' | 'confirmed';
  proposalRevision: number | null;
  sourceMaestroTurnId: string;
  taskRevision: number;
  decision: Decision;
  candidates: { a: CandidateEvidence; b: CandidateEvidence };
  createdAt: number;
}
export interface OutcomeSnapshot {
  runId: string;
  revision: number;
  task: { revision: number; criteria: string[] } | null;
  latestProposal: OutcomeRevision | null;
  latestConfirmed: OutcomeRevision | null;
  canConfirm: boolean;
  history: OutcomeRevision[];
}
export type AttemptStatus = 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted';
export interface TokenCounts {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  totalTokens: number | null;
}
export interface UsageObservation {
  key: string;
  source: string;
  scope: 'turn' | 'provider-cumulative' | 'unknown';
  coverage: 'main-loop' | 'all-model-calls' | 'unknown';
  completeness: 'complete' | 'partial' | 'unknown';
  requestedModel: string;
  actualModel: string | null;
  tokens: TokenCounts;
  costUsd: number | null;
  providerDurationMs: number | null;
}
export const unknownTokens = (): TokenCounts => ({
  inputTokens: null,
  cachedInputTokens: null,
  cacheWriteInputTokens: null,
  outputTokens: null,
  reasoningOutputTokens: null,
  totalTokens: null,
});
