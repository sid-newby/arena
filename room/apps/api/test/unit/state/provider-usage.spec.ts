import { anthropicUsage, CodexUsageTracker } from '../../../src/state/provider-usage.js';
import type { TurnContext } from '../../../src/chat/chat.types.js';
import type { TokenCounts, UsageObservation } from '../../../src/state/state.contract.js';
const tokens = (input: number, output = 0): TokenCounts => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  reasoningOutputTokens: 0,
});
function context() {
  const observations: UsageObservation[] = [],
    baselines: TokenCounts[] = [];
  const callbacks: TurnContext = {
    text: '',
    controller: new AbortController(),
    append: () => {},
    saveSession: () => {},
    tool: async () => '',
    usage: (value) => observations.push(value),
    saveUsageBaseline: (_session, value) => baselines.push(value),
  };
  return { context: callbacks, observations, baselines };
}
const notification = (turnId: string, input: number, output = 0) => ({
  threadId: 'thread-private-id',
  turnId,
  tokenUsage: { total: tokens(input, output), last: tokens(5) },
});
describe('provider usage normalization', () => {
  it('subtracts thread totals across all model calls instead of using the latest response', () => {
    const fixture = context(),
      tracker = new CodexUsageTracker(fixture.context, 'requested-model', true);
    tracker.observe(notification('turn-1', 8277), 'thread-private-id', 'turn-1');
    tracker.observe(notification('turn-1', 16600), 'thread-private-id', 'turn-1');
    tracker.finish(true, 4519);
    expect(fixture.observations.at(-1)).toMatchObject({
      scope: 'turn',
      completeness: 'complete',
      tokens: { totalTokens: 16600 },
      providerDurationMs: 4519,
    });
    expect(JSON.stringify(fixture.observations)).not.toContain('thread-private-id');
  });
  it('takes a resumed pre-turn baseline and ignores other thread/turn notifications', () => {
    const fixture = context(),
      tracker = new CodexUsageTracker(fixture.context, 'model', false);
    tracker.observe(notification('old-turn', 16600), 'thread-private-id', undefined);
    tracker.observe(notification('old-turn', 999999), 'thread-private-id', 'new-turn');
    tracker.observe(notification('new-turn', 24969), 'wrong-thread', 'new-turn');
    expect(fixture.observations).toHaveLength(0);
    tracker.observe(notification('new-turn', 33376), 'thread-private-id', 'new-turn');
    tracker.finish(true, 3690);
    expect(fixture.observations.at(-1)).toMatchObject({
      scope: 'turn',
      tokens: { totalTokens: 16776 },
    });
  });
  it('uses persisted baselines and leaves unknown or reset counters cumulative', () => {
    const fixture = context();
    fixture.context.usageBaseline = tokens(100);
    const tracker = new CodexUsageTracker(fixture.context, 'model', false);
    tracker.observe(notification('turn', 150), 'thread-private-id', 'turn');
    expect(fixture.observations.at(-1)?.tokens.inputTokens).toBe(50);
    tracker.observe(notification('turn', 20), 'thread-private-id', 'turn');
    tracker.finish(false, undefined);
    expect(fixture.observations.at(-1)).toMatchObject({
      scope: 'provider-cumulative',
      completeness: 'unknown',
      source: 'codex.thread.total.counter-reset',
      tokens: { totalTokens: 20 },
    });
    const absent = context(),
      unknown = new CodexUsageTracker(absent.context, 'model', false);
    unknown.observe(notification('turn', 20), 'thread-private-id', 'turn');
    unknown.finish(true, undefined);
    expect(absent.observations.at(-1)).toMatchObject({
      scope: 'provider-cumulative',
      completeness: 'unknown',
      providerDurationMs: null,
    });
  });
  it('records Claude error result main-loop usage before failure and never treats resumed model/cost totals as turn totals', () => {
    const result = anthropicUsage(
      {
        subtype: 'error_during_execution',
        usage: { input_tokens: 20, output_tokens: 0, cache_read_input_tokens: 8 },
        duration_api_ms: 170,
        duration_ms: 17,
        total_cost_usd: 100,
        modelUsage: {
          'actual-model': {
            inputTokens: 10000,
            outputTokens: 1000,
            thinkingTokens: 900,
            costUSD: 100,
          },
        },
      },
      'requested-model',
    );
    expect(result[0]).toMatchObject({
      scope: 'turn',
      coverage: 'main-loop',
      completeness: 'partial',
      requestedModel: 'requested-model',
      actualModel: null,
      tokens: { inputTokens: 20, outputTokens: 0, totalTokens: null, reasoningOutputTokens: null },
      costUsd: null,
      providerDurationMs: 17,
    });
    expect(result[1]).toMatchObject({
      scope: 'provider-cumulative',
      actualModel: 'actual-model',
      tokens: { outputTokens: 1000, reasoningOutputTokens: 900 },
    });
    expect(result[2]).toMatchObject({
      source: 'anthropic.result.duration_api_ms',
      scope: 'provider-cumulative',
      providerDurationMs: 170,
    });
    expect(result[3]).toMatchObject({ scope: 'provider-cumulative', costUsd: 100 });
    expect(anthropicUsage({}, 'model')).toEqual([]);
  });
});
