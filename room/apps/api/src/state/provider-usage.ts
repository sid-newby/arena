import { createHash } from 'node:crypto';
import type { TurnContext } from '../chat/chat.types.js';
import { unknownTokens, type TokenCounts, type UsageObservation } from './state.contract.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function identity(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function codexTokens(value: unknown): TokenCounts {
  const usage = object(value);
  return {
    inputTokens: count(usage.inputTokens),
    cachedInputTokens: count(usage.cachedInputTokens),
    cacheWriteInputTokens: count(usage.cacheWriteInputTokens),
    outputTokens: count(usage.outputTokens),
    reasoningOutputTokens: count(usage.reasoningOutputTokens),
    totalTokens: count(usage.totalTokens),
  };
}
function delta(total: TokenCounts, baseline: TokenCounts): TokenCounts | null {
  const subtract = (key: keyof TokenCounts) =>
    total[key] === null || baseline[key] === null ? null : total[key] - baseline[key];
  const result: TokenCounts = {
    inputTokens: subtract('inputTokens'),
    cachedInputTokens: subtract('cachedInputTokens'),
    cacheWriteInputTokens: subtract('cacheWriteInputTokens'),
    outputTokens: subtract('outputTokens'),
    reasoningOutputTokens: subtract('reasoningOutputTokens'),
    totalTokens: subtract('totalTokens'),
  };
  return Object.values(result).some((value) => value !== null && value < 0) ? null : result;
}
const zeroTokens = (): TokenCounts => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
});

export class CodexUsageTracker {
  private baseline: TokenCounts | undefined;
  private latest: TokenCounts | undefined;
  private reset = false;
  constructor(
    private readonly context: TurnContext,
    private readonly model: string,
    fresh: boolean,
  ) {
    this.baseline = fresh ? zeroTokens() : context.usageBaseline;
  }
  observe(
    value: Record<string, unknown>,
    threadId: string | undefined,
    activeTurnId: string | undefined,
  ) {
    if (!threadId || value.threadId !== threadId) return;
    const tokens = codexTokens(object(value.tokenUsage).total);
    if (!Object.values(tokens).some((counter) => counter !== null)) return;
    if (!activeTurnId) {
      this.baseline = tokens;
      this.context.saveUsageBaseline?.(threadId, tokens);
      return;
    }
    if (value.turnId !== activeTurnId) return;
    if (this.latest && !delta(tokens, this.latest)) this.reset = true;
    if (this.baseline && !delta(tokens, this.baseline)) this.reset = true;
    this.latest = tokens;
    this.context.saveUsageBaseline?.(threadId, tokens);
    this.publish(false, null);
  }
  finish(complete: boolean, providerDurationMs: unknown) {
    if (this.latest) this.publish(complete, amount(providerDurationMs));
    else if (amount(providerDurationMs) !== null)
      this.context.usage?.({
        key: 'codex.turn.duration',
        source: 'codex.turn.completed.durationMs',
        scope: 'turn',
        coverage: 'unknown',
        completeness: 'unknown',
        requestedModel: this.model,
        actualModel: this.model,
        tokens: unknownTokens(),
        costUsd: null,
        providerDurationMs: amount(providerDurationMs),
      });
  }
  private publish(complete: boolean, providerDurationMs: number | null) {
    if (!this.latest) return;
    const scoped = !this.reset && this.baseline ? delta(this.latest, this.baseline) : null;
    const observation: UsageObservation = {
      key: '',
      source: this.reset ? 'codex.thread.total.counter-reset' : 'codex.thread.total',
      scope: scoped ? 'turn' : 'provider-cumulative',
      coverage: 'all-model-calls',
      completeness: scoped ? (complete ? 'complete' : 'partial') : 'unknown',
      requestedModel: this.model,
      actualModel: scoped ? this.model : null,
      tokens: scoped ?? this.latest,
      costUsd: null,
      providerDurationMs,
    };
    observation.key = 'codex:' + identity(observation);
    this.context.usage?.(observation);
  }
}

export function anthropicUsage(value: unknown, requestedModel: string): UsageObservation[] {
  const result = object(value),
    usage = object(result.usage),
    modelUsage = object(result.modelUsage);
  const observations: UsageObservation[] = [];
  if (Object.keys(usage).length)
    observations.push({
      key: 'anthropic.result.main-loop',
      source: 'anthropic.result.usage',
      scope: 'turn',
      coverage: 'main-loop',
      completeness:
        result.subtype === 'success' && result.is_error !== true ? 'complete' : 'partial',
      requestedModel,
      actualModel: null,
      tokens: {
        inputTokens: count(usage.input_tokens),
        cachedInputTokens: count(usage.cache_read_input_tokens),
        cacheWriteInputTokens: count(usage.cache_creation_input_tokens),
        outputTokens: count(usage.output_tokens),
        reasoningOutputTokens: count(object(usage.output_tokens_details).thinking_tokens),
        totalTokens: null,
      },
      costUsd: null,
      providerDurationMs: amount(result.duration_ms),
    });
  for (const [model, raw] of Object.entries(modelUsage)) {
    const counters = object(raw);
    observations.push({
      key: 'anthropic.result.model:' + model,
      source: 'anthropic.result.modelUsage',
      scope: 'provider-cumulative',
      coverage: 'all-model-calls',
      completeness: 'unknown',
      requestedModel,
      actualModel: model,
      tokens: {
        inputTokens: count(counters.inputTokens),
        cachedInputTokens: count(counters.cacheReadInputTokens),
        cacheWriteInputTokens: count(counters.cacheCreationInputTokens),
        outputTokens: count(counters.outputTokens),
        reasoningOutputTokens: count(counters.thinkingTokens),
        totalTokens: null,
      },
      costUsd: amount(counters.costUSD),
      providerDurationMs: null,
    });
  }
  if (amount(result.duration_api_ms) !== null)
    observations.push({
      key: 'anthropic.result.api-duration',
      source: 'anthropic.result.duration_api_ms',
      scope: 'provider-cumulative',
      coverage: 'all-model-calls',
      completeness: 'unknown',
      requestedModel,
      actualModel: null,
      tokens: unknownTokens(),
      costUsd: null,
      providerDurationMs: amount(result.duration_api_ms),
    });
  if (amount(result.total_cost_usd) !== null)
    observations.push({
      key: 'anthropic.result.cost',
      source: 'anthropic.result.total_cost_usd',
      scope: 'provider-cumulative',
      coverage: 'all-model-calls',
      completeness: 'unknown',
      requestedModel,
      actualModel: null,
      tokens: unknownTokens(),
      costUsd: amount(result.total_cost_usd),
      providerDurationMs: null,
    });
  return observations;
}
