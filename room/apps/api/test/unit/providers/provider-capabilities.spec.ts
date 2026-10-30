import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({
  spawn: vi.fn<(...args: unknown[]) => unknown>(),
  query: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock('node:child_process', () => ({ spawn: fake.spawn, execFileSync: vi.fn<() => string>() }));
vi.mock('@anthropic-ai/claude-agent-sdk', async (original) => {
  const sdk = await original<typeof import('@anthropic-ai/claude-agent-sdk')>();
  return { ...sdk, query: fake.query };
});
import { discoverModels } from '../../../src/providers/provider-capabilities.js';

let controlHome: string;
beforeEach(() => {
  vi.clearAllMocks();
  controlHome = mkdtempSync(join(tmpdir(), 'room-catalog-'));
  vi.stubEnv('ROOM_CONTROL_HOME', controlHome);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(controlHome, { recursive: true, force: true });
});

function codex(account = 'chatgpt') {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn<() => void>(),
  });
  child.stdin.on('data', (data) => {
    const request = JSON.parse(String(data));
    calls.push(request);
    if (typeof request.id !== 'number') return;
    const result =
      request.method === 'account/read'
        ? { account: { type: account } }
        : request.method === 'model/list'
          ? {
              data: [
                {
                  model: request.params.cursor ? 'gpt-6.1-sol' : 'gpt-6-luna',
                  displayName: 'Model',
                  supportedReasoningEfforts: [{ reasoningEffort: 'high' }],
                },
              ],
              nextCursor: request.params.cursor ? null : 'page-2',
            }
          : {};
    queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`));
  });
  fake.spawn.mockReturnValue(child);
  return { calls, child };
}

it('discovers every Codex catalog page only after verifying ChatGPT authentication', async () => {
  const fixture = codex();
  expect(await discoverModels('codex')).toEqual({
    provider: 'codex',
    status: 'ready',
    models: [
      { id: 'gpt-6-luna', name: 'Model', efforts: ['high'] },
      { id: 'gpt-6.1-sol', name: 'Model', efforts: ['high'] },
    ],
  });
  expect(fixture.calls.map((call) => call.method)).toEqual([
    'initialize',
    'initialized',
    'account/read',
    'model/list',
    'model/list',
  ]);
  expect(fixture.child.kill).toHaveBeenCalled();
});

it('reports non-subscription Codex routes as unavailable without catalog access', async () => {
  const fixture = codex('apiKey');
  expect(await discoverModels('codex')).toMatchObject({
    provider: 'codex',
    status: 'unavailable',
    models: [],
  });
  expect(fixture.calls.some((call) => call.method === 'model/list')).toBe(false);
});

it('uses canonical Claude catalog IDs and advertised efforts without inference', async () => {
  const close = vi.fn<() => void>();
  fake.query.mockReturnValue({
    close,
    accountInfo: async () => ({ apiProvider: 'firstParty', tokenSource: 'claudeAiOauth' }),
    supportedModels: async () => [
      {
        value: 'opus',
        resolvedModel: 'claude-opus-5-5',
        displayName: 'Opus',
        supportedEffortLevels: ['high', 'max'],
      },
    ],
  });
  expect(await discoverModels('anthropic')).toEqual({
    provider: 'anthropic',
    status: 'ready',
    models: [{ id: 'claude-opus-5-5', name: 'Opus', efforts: ['high', 'max'] }],
  });
  expect(close).toHaveBeenCalledOnce();
  expect(fake.query).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.any(Object),
      options: expect.objectContaining({ tools: [], strictMcpConfig: true, settingSources: [] }),
    }),
  );
});

it('rejects Claude cloud routing before model discovery', async () => {
  const supportedModels = vi.fn<() => Promise<unknown[]>>(async () => []);
  const close = vi.fn<() => void>();
  fake.query.mockReturnValue({
    close,
    accountInfo: async () => ({ apiProvider: 'vertex' }),
    supportedModels,
  });
  expect(await discoverModels('anthropic')).toMatchObject({ status: 'unavailable', models: [] });
  expect(supportedModels).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it('recognizes the installed SDK subscription metadata when token-source fields are absent', async () => {
  fake.query.mockReturnValue({
    close: vi.fn<() => void>(),
    accountInfo: async () => ({ apiProvider: 'firstParty', subscriptionType: 'Claude Max' }),
    supportedModels: async () => [
      {
        value: 'opus',
        resolvedModel: 'claude-opus-5-5',
        displayName: 'Opus',
        supportedEffortLevels: ['high'],
      },
    ],
  });
  expect(await discoverModels('anthropic')).toMatchObject({
    status: 'ready',
    models: [{ id: 'claude-opus-5-5' }],
  });
});

it('does not treat a plan label as permission to use an explicit API-key route', async () => {
  const supportedModels = vi.fn<() => Promise<unknown[]>>(async () => []);
  fake.query.mockReturnValue({
    close: vi.fn<() => void>(),
    accountInfo: async () => ({
      apiProvider: 'firstParty',
      subscriptionType: 'Claude Max',
      tokenSource: 'apiKey',
      apiKeySource: 'user',
    }),
    supportedModels,
  });
  expect(await discoverModels('anthropic')).toMatchObject({ status: 'unavailable', models: [] });
  expect(supportedModels).not.toHaveBeenCalled();
});

it.each(['oauth_token', 'claude.ai'])(
  'recognizes the signed-in Claude CLI method %s',
  async (authMethod) => {
    const { execFileSync } = await import('node:child_process');
    const { anthropicReady } = await import('../../../src/providers/anthropic-auth.js');
    vi.mocked(execFileSync).mockReturnValue(
      JSON.stringify({
        loggedIn: true,
        authMethod,
        apiProvider: 'firstParty',
        subscriptionType: 'max',
      }),
    );
    expect(anthropicReady()).toBe(true);
  },
);
