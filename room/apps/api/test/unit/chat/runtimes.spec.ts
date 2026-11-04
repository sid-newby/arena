import type { TurnContext } from '../../../src/chat/chat.types.js';
import type { SdkMcpToolDefinition, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { recallTool } from '../../../src/memory/room-memory.js';
import { hangoutInstructions } from '../../../src/chat/runtime-tools.js';
import { DEFAULT_MODELS } from '../../../src/runs/run.contract.js';

const fake = vi.hoisted(() => ({
  query: vi.fn<(...args: unknown[]) => unknown>(),
  createServer: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock('@anthropic-ai/claude-agent-sdk', async (original) => {
  const sdk = await original<typeof import('@anthropic-ai/claude-agent-sdk')>();
  return { ...sdk, query: fake.query, createSdkMcpServer: fake.createServer };
});
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn<() => string>(
    () => '{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}',
  ),
  spawnSync: vi.fn<() => { status: number; stdout: string; stderr: string }>(() => ({
    status: 0,
    stdout: 'Logged in using ChatGPT',
    stderr: '',
  })),
  spawn: vi.fn<(...args: unknown[]) => unknown>(),
}));
import {
  createRuntimes,
  createParticipantRuntime,
  runAnthropic,
} from '../../../src/chat/runtimes.js';
import { assertAnthropicSubscription } from '../../../src/providers/anthropic-auth.js';
import { providerEnvironment } from '../../../src/providers/provider-environment.js';

function context(): TurnContext {
  return {
    text: 'Attributed A message',
    session: 'retained-session',
    controller: new AbortController(),
    append: vi.fn<TurnContext['append']>(),
    saveSession: vi.fn<TurnContext['saveSession']>(),
    tool: vi.fn<TurnContext['tool']>(async () => 'selected'),
  };
}

function session(
  model = 'claude-opus-5-5',
  account = { apiProvider: 'firstParty', tokenSource: 'oauth', apiKeySource: 'none' },
) {
  const close = vi.fn<() => void>();
  const received: SDKUserMessage[] = [];
  fake.createServer.mockReturnValue({ type: 'sdk', name: 'room' });
  fake.query.mockImplementation((argument) => {
    const input = argument as { prompt: AsyncIterable<SDKUserMessage> };
    return {
      close,
      accountInfo: async () => account,
      async *[Symbol.asyncIterator]() {
        for await (const message of input.prompt) received.push(message);
        yield { type: 'system', subtype: 'init', model, session_id: 'retained-session' };
        yield { type: 'result', subtype: 'success', is_error: false };
      },
    };
  });
  return { close, received };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it('uses a subscription-authorized stream and the same room addressing schema', async () => {
  const fakeSession = session();
  const turn = context();
  await createRuntimes('/tmp').b.run(turn);
  expect(fakeSession.received[0].message.content).toBe(turn.text);
  expect(fake.query).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        resume: 'retained-session',
        tools: ['WebSearch', 'WebFetch'],
        mcpServers: expect.objectContaining({
          context7: { type: 'http', url: 'https://mcp.context7.com/mcp' },
        }),
        allowedTools: expect.arrayContaining([
          'mcp__room__address_panelist',
          'WebSearch',
          'WebFetch',
          'mcp__context7__resolve-library-id',
          'mcp__context7__query-docs',
        ]),
        systemPrompt: expect.stringContaining('before writing any reply text'),
      }),
    }),
  );
  const config = fake.createServer.mock.calls[0][0] as { tools: SdkMcpToolDefinition[] };
  const address = config.tools.find((entry) => entry.name === 'address_panelist')!;
  await address.handler({ recipient: 'a' }, {});
  expect(turn.tool).toHaveBeenCalledWith('address_panelist', { recipient: 'a' });
  const summary = config.tools.find((entry) => entry.name === 'summarize_speech')!;
  await summary.handler({ text: 'A short summary.' }, {});
  expect(turn.tool).toHaveBeenCalledWith('summarize_speech', { text: 'A short summary.' });
  expect(fakeSession.close).toHaveBeenCalledOnce();
});

it('supports Anthropic in either seat while preserving stable identities', async () => {
  session();
  const runtime = createParticipantRuntime('a', DEFAULT_MODELS.b, '/tmp');
  expect(runtime.info).toMatchObject({
    id: 'a',
    name: 'A',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    effort: 'high',
  });
  await runtime.run(context());
});

it('sends Fable the hangout identities in the Claude system prompt', async () => {
  session();
  const instructions = hangoutInstructions('b', 'Fable', 'Astra', false);
  await createRuntimes('/tmp').b.run({ ...context(), instructions, refreshInstructions: true });
  expect(instructions).toContain('Honcho memory for public room is off here');
  expect(instructions).toContain('You are Fable in seat B');
  expect(instructions).toContain('Astra is in seat A');
  expect(instructions).not.toMatch(/debate|opponent|competition/i);
  expect(fake.query).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        resume: 'retained-session',
        systemPrompt: { type: 'custom', prompt: instructions, snapshot: false },
      }),
    }),
  );
});

it('makes private recall the only tool available to the Claude whisper session', async () => {
  session();
  const turn = context();
  await runAnthropic(
    { ...turn, mode: 'side', tools: [recallTool, { ...recallTool, name: 'address_panelist' }] },
    '/tmp',
    DEFAULT_MODELS.b,
    'b',
  );
  const server = fake.createServer.mock.calls[0][0] as { tools: SdkMcpToolDefinition[] };
  expect(server.tools.map((definition) => definition.name)).toEqual(['recall_room']);
  expect(fake.query).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        tools: [],
        allowedTools: ['mcp__room__recall_room'],
        mcpServers: { room: { type: 'sdk', name: 'room' } },
      }),
    }),
  );
  await server.tools[0].handler({ query: 'Earlier whisper?' }, {});
  expect(turn.tool).toHaveBeenCalledWith('recall_room', { query: 'Earlier whisper?' });
});

it('gives Maestro no panel, expression, peer, or default workspace tools', async () => {
  session('claude-opus-5-5');
  await createParticipantRuntime('maestro', DEFAULT_MODELS.b, '/tmp').run(context());
  expect(fake.createServer.mock.calls[0][0]).toMatchObject({ tools: [] });
  expect(fake.query).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        allowedTools: expect.arrayContaining(['WebSearch', 'mcp__context7__query-docs']),
        tools: ['WebSearch', 'WebFetch'],
        systemPrompt: expect.stringContaining('Your name is Maestro'),
      }),
    }),
  );
});

it('passes caller-supplied tool schemas and instructions to Claude', async () => {
  session();
  const turn = {
    ...context(),
    tools: [
      {
        name: 'inspect',
        description: 'Inspect a record.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    ],
    instructions: 'Only inspect supplied records.',
  };
  await runAnthropic(turn, '/tmp', DEFAULT_MODELS.b, 'maestro');
  const config = fake.createServer.mock.calls[0][0] as { tools: SdkMcpToolDefinition[] };
  expect(config.tools.map((entry) => entry.name)).toEqual(['inspect']);
  expect(fake.query).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({
        systemPrompt: turn.instructions,
        allowedTools: expect.arrayContaining([
          'mcp__room__inspect',
          'WebSearch',
          'mcp__context7__query-docs',
        ]),
      }),
    }),
  );
});

it('closes a stalled account check on interrupt before sending any prompt', async () => {
  const turn = context();
  let rejectAccount!: (error: Error) => void;
  const accountInfo = vi.fn<() => Promise<never>>(
    () =>
      new Promise((_, reject) => {
        rejectAccount = reject;
      }),
  );
  const close = vi.fn<() => void>(() => rejectAccount(new Error('Closed before dispatch.')));
  const interrupt = vi.fn<() => Promise<void>>();
  fake.query.mockReturnValue({ accountInfo, close, interrupt });
  const running = runAnthropic(turn, '/tmp', DEFAULT_MODELS.b, 'b');
  try {
    expect(accountInfo).toHaveBeenCalledOnce();
    turn.controller.abort();
    expect(close).toHaveBeenCalled();
    expect(interrupt).not.toHaveBeenCalled();
  } finally {
    close();
    await expect(running).rejects.toThrow('Closed before dispatch.');
  }
});
it('refuses API-key authentication before releasing any user prompt', async () => {
  const fakeSession = session('claude-opus-5-5', {
    apiProvider: 'firstParty',
    tokenSource: 'none',
    apiKeySource: 'ANTHROPIC_API_KEY',
  });
  await expect(runAnthropic(context(), '/tmp', DEFAULT_MODELS.b, 'b')).rejects.toThrow(
    'subscription',
  );
  expect(fakeSession.received).toEqual([]);
  expect(fakeSession.close).toHaveBeenCalledOnce();
});

it('rejects an unexpected initialized model and unsupported effort', async () => {
  session('claude-sonnet-other');
  const turn = context();
  await expect(runAnthropic(turn, '/tmp', DEFAULT_MODELS.b, 'b')).rejects.toThrow(
    'Unexpected Claude model',
  );
  expect(turn.saveSession).not.toHaveBeenCalled();
  await expect(
    runAnthropic(context(), '/tmp', { ...DEFAULT_MODELS.b, effort: 'ultra' }, 'b'),
  ).rejects.toThrow('does not support');
});

it('accepts first-party OAuth metadata even when subscriptionType is omitted', () => {
  expect(() =>
    assertAnthropicSubscription({
      apiProvider: 'firstParty',
      tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
    }),
  ).not.toThrow();
  expect(() =>
    assertAnthropicSubscription({ apiProvider: 'bedrock', tokenSource: 'oauth' }),
  ).toThrow('subscription');
});

it('does not inherit paid routes, credential helpers, or unrelated service secrets', () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'hidden');
  vi.stubEnv('OPENAI_API_KEY', 'hidden');
  vi.stubEnv('ANTHROPIC_BASE_URL', 'https://other.invalid');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'hidden');
  vi.stubEnv('CARTESIA_API_KEY', 'hidden');
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'hidden');
  const env = providerEnvironment();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  expect(env.CARTESIA_API_KEY).toBeUndefined();
  expect(env.PATH).toBe(process.env.PATH);
  expect(providerEnvironment('codex').CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(providerEnvironment('anthropic').CLAUDE_CODE_OAUTH_TOKEN).toBe('hidden');
});

it('captures per-turn Claude usage before rejecting a provider result error', async () => {
  session();
  fake.query.mockImplementation(() => ({
    close: () => {},
    accountInfo: async () => ({
      apiProvider: 'firstParty',
      tokenSource: 'oauth',
      apiKeySource: 'none',
    }),
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['Provider execution failed'],
        usage: { input_tokens: 7, output_tokens: 5, output_tokens_details: { thinking_tokens: 3 } },
        duration_ms: 20,
        duration_api_ms: 120,
        total_cost_usd: 10,
        modelUsage: {
          'claude-opus-5-5': {
            inputTokens: 700,
            outputTokens: 500,
            thinkingTokens: 300,
            costUSD: 10,
          },
        },
      };
    },
  }));
  const observations: import('../../../src/state/state.contract.js').UsageObservation[] = [];
  const turn = {
    ...context(),
    usage: (observation: import('../../../src/state/state.contract.js').UsageObservation) =>
      observations.push(observation),
  };
  await expect(runAnthropic(turn, '/tmp', DEFAULT_MODELS.b, 'b')).rejects.toThrow(
    'Provider execution failed',
  );
  expect(observations[0]).toMatchObject({
    scope: 'turn',
    coverage: 'main-loop',
    completeness: 'partial',
    tokens: { inputTokens: 7, outputTokens: 5, reasoningOutputTokens: 3, totalTokens: null },
    providerDurationMs: 20,
  });
  expect(
    observations.find((observation) => observation.source === 'anthropic.result.duration_api_ms'),
  ).toMatchObject({ scope: 'provider-cumulative', providerDurationMs: 120 });
});
