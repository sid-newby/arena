import { ROOM_TOOL_VERSION, HANGOUT_TOOL_VERSION } from '../../../src/chat/panel-presence.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TurnContext } from '../../../src/chat/chat.types.js';

const fake = vi.hoisted(() => ({
  spawn: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock('node:child_process', () => ({
  spawn: fake.spawn,
  spawnSync: vi.fn<(...args: unknown[]) => unknown>(),
}));
import { hangoutInstructions } from '../../../src/chat/runtime-tools.js';
import { runCodex } from '../../../src/chat/codex.runtime.js';

function protocol(failInjection = false, model = 'gpt-6-luna', account = 'chatgpt') {
  const calls: Record<string, unknown>[] = [];
  const server = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn<() => void>(),
  });
  server.stdin.on('data', (data) => {
    const request = JSON.parse(String(data));
    calls.push(request);
    if (typeof request.id !== 'number') return;
    const response =
      request.method === 'thread/inject_items' && failInjection
        ? { id: request.id, error: { message: 'Injection failed' } }
        : {
            id: request.id,
            result:
              request.method === 'thread/start' || request.method === 'thread/resume'
                ? { model, thread: { id: 'new-session' } }
                : request.method === 'account/read'
                  ? { account: { type: account } }
                  : {},
          };
    queueMicrotask(() => {
      server.stdout.write(`${JSON.stringify(response)}\n`);
      if (request.method === 'turn/start')
        server.stdout.write(
          `${JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed' } } })}\n`,
        );
    });
  });
  fake.spawn.mockReturnValue(server);
  return calls;
}

function context(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    text: 'New prompt',
    controller: new AbortController(),
    append: vi.fn<TurnContext['append']>(),
    saveSession: vi.fn<TurnContext['saveSession']>(),
    tool: vi.fn<TurnContext['tool']>(),
    ...overrides,
  };
}

describe('Codex room tool sessions', () => {
  let workspace: string;
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'room-codex-'));
    vi.stubEnv('ROOM_CONTROL_HOME', join(workspace, 'control'));
  });
  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('closes a stalled initialize request on interrupt before dispatch', async () => {
    const turn = context();
    const server = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn<() => void>(),
    });
    fake.spawn.mockReturnValue(server);
    const running = runCodex(turn, workspace);
    try {
      turn.controller.abort();
      expect(server.kill).toHaveBeenCalled();
    } finally {
      server.emit('exit', 0);
      await expect(running).rejects.toThrow(/Codex connection closed/);
    }
  });
  it.each(['thread/start', 'thread/resume'] as const)(
    'sends Astra the memory guide on %s',
    async (method) => {
      const calls = protocol();
      const instructions = hangoutInstructions('a', 'Astra', 'Fable', true);
      await runCodex(
        context({
          instructions,
          ...(method === 'thread/resume'
            ? { session: 'saved', toolVersion: ROOM_TOOL_VERSION }
            : {}),
        }),
        workspace,
      );
      expect(instructions).toContain('Honcho memory for public room is configured');
      expect(instructions).toContain('name: room-memory');
      expect(instructions).toContain('You are Astra in seat A');
      expect(instructions).toContain('Fable is in seat B');
      expect(instructions).not.toMatch(/debate|opponent|competition/i);
      expect(calls.find((call) => call.method === method)).toMatchObject({
        params: { baseInstructions: instructions },
      });
    },
  );

  it('registers expression tools on new sessions', async () => {
    const calls = protocol();
    const turn = context();
    await runCodex(turn, workspace);
    const start = calls.find((call) => call.method === 'thread/start');
    expect(start).toMatchObject({
      params: {
        config: {
          web_search: 'live',
          'mcp_servers.context7': { url: 'https://mcp.context7.com/mcp' },
        },
        dynamicTools: expect.arrayContaining([
          expect.objectContaining({
            name: 'express',
            inputSchema: expect.objectContaining({
              properties: expect.objectContaining({
                mood: {
                  type: 'string',
                  enum: ['annoyed', 'grumpy', 'amused', 'skeptical', 'startled'],
                },
              }),
            }),
          }),
          expect.objectContaining({ name: 'clear_expression' }),
          expect.objectContaining({
            name: 'address_panelist',
            inputSchema: expect.objectContaining({ additionalProperties: false }),
          }),
          expect.objectContaining({ name: 'face_panel' }),
          expect.objectContaining({ name: 'set_pose' }),
          expect.objectContaining({ name: 'summarize_speech' }),
        ]),
      },
    });
    expect(calls.some((call) => call.method === 'thread/inject_items')).toBe(false);
    expect(turn.saveSession).toHaveBeenCalledWith('new-session', 7);
  });

  it.each([0, 2, 3, 4, 5, 6])(
    'migrates a version %i session and injects retained messages and room tool records before saving',
    async (toolVersion) => {
      const calls = protocol();
      const turn = context({
        session: 'old-session',
        toolVersion,
        priorHistory: [
          {
            prompt: 'Please face peer',
            text: 'Facing peer.',
            status: 'completed',
            tools: [{ name: 'set_pose', input: '{"pose":"right"}', output: 'Panel pose set.' }],
          },
        ],
      });
      await runCodex(turn, workspace);
      expect(calls.some((call) => call.method === 'thread/resume')).toBe(false);
      expect(calls.map((call) => call.method)).toEqual([
        'initialize',
        'initialized',
        'account/read',
        'thread/start',
        'thread/inject_items',
        'turn/start',
      ]);
      expect(calls.find((call) => call.method === 'thread/inject_items')).toMatchObject({
        params: {
          threadId: 'new-session',
          items: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: 'Please face peer' }],
            },
            {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: expect.stringContaining('Historical room tool records'),
                },
              ],
            },
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Facing peer.' }],
            },
          ],
        },
      });
      expect(turn.saveSession).toHaveBeenCalledWith('new-session', 7);
    },
  );

  it('upgrades the previous public hangout toolset for project_shell and resumes the upgraded session', async () => {
    const calls = protocol();
    const tools = [
      {
        name: 'project_shell',
        description: 'Run a shell command in the project',
        inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
      },
    ];
    const turn = context({
      session: 'old-session',
      toolVersion: 8,
      requiredToolVersion: HANGOUT_TOOL_VERSION,
      tools,
    });
    await runCodex(turn, workspace);
    expect(calls.find((call) => call.method === 'thread/start')?.params).toMatchObject({
      dynamicTools: [expect.objectContaining({ name: 'project_shell' })],
    });
    expect(turn.saveSession).toHaveBeenCalledWith('new-session', HANGOUT_TOOL_VERSION);
    const resumed = protocol();
    await runCodex(
      { ...turn, session: 'new-session', toolVersion: HANGOUT_TOOL_VERSION },
      workspace,
    );
    expect(resumed.filter((call) => call.method === 'thread/start')).toHaveLength(0);
    expect(resumed.find((call) => call.method === 'thread/resume')?.params).toMatchObject({
      threadId: 'new-session',
    });
  });
  it('resumes current tool sessions without replaying room history', async () => {
    const calls = protocol();
    await runCodex(context({ session: 'old-session', toolVersion: 7 }), workspace);
    expect(calls.find((call) => call.method === 'thread/resume')).toMatchObject({
      params: { threadId: 'old-session' },
    });
    expect(
      calls.some((call) => call.method === 'thread/start' || call.method === 'thread/inject_items'),
    ).toBe(false);
  });

  it('does not replace the saved legacy session when history injection fails', async () => {
    const calls = protocol(true);
    const turn = context({
      session: 'old-session',
      priorHistory: [{ prompt: 'Hello', text: 'Hi', status: 'completed', tools: [] }],
    });
    await expect(runCodex(turn, workspace)).rejects.toThrow('Injection failed');
    expect(turn.saveSession).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === 'turn/start')).toBe(false);
  });
});

describe('Configured Codex role sessions', () => {
  let control: string;
  beforeEach(() => {
    control = mkdtempSync(join(tmpdir(), 'room-codex-configured-'));
    vi.stubEnv('ROOM_CONTROL_HOME', control);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(control, { recursive: true, force: true });
  });
  it('does not start a thread on a non-subscription account', async () => {
    const calls = protocol(false, 'gpt-6-luna', 'apiKey');
    const turn = context();
    await expect(runCodex(turn, '/tmp')).rejects.toThrow('ChatGPT subscription');
    expect(calls.some((call) => call.method === 'thread/start')).toBe(false);
    expect(turn.saveSession).not.toHaveBeenCalled();
  });

  it('selects the requested model and effort and custom Maestro tools without fallback', async () => {
    const calls = protocol(false, 'gpt-6.1-sol');
    const turn = context({
      tools: [
        {
          name: 'inspect',
          description: 'Inspect a record.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
      instructions: 'Use only the supplied inspection tool.',
    });
    await runCodex(
      turn,
      '/tmp',
      { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' },
      'maestro',
    );
    expect(calls.find((call) => call.method === 'thread/start')).toMatchObject({
      params: {
        model: 'gpt-6.1-sol',
        allowProviderModelFallback: false,
        baseInstructions: turn.instructions,
        dynamicTools: [{ type: 'function', ...turn.tools![0] }],
      },
    });
    expect(calls.find((call) => call.method === 'turn/start')).toMatchObject({
      params: { model: 'gpt-6.1-sol', effort: 'high' },
    });
  });

  it('does not save or invoke an unexpected initialized model', async () => {
    const calls = protocol(false, 'other-model');
    const turn = context();
    await expect(runCodex(turn, '/tmp')).rejects.toThrow('Unexpected Codex model');
    expect(turn.saveSession).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === 'turn/start')).toBe(false);
  });
  it('marks cancellation unconfirmed when the provider disconnects before its terminal notification', async () => {
    const server = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn<() => void>(),
    });
    const turn = context();
    server.stdin.on('data', (data) => {
      const call = JSON.parse(String(data));
      if (typeof call.id !== 'number') return;
      const result =
        call.method === 'account/read'
          ? { account: { type: 'chatgpt' } }
          : call.method === 'thread/start'
            ? { model: 'gpt-6-luna', thread: { id: 'thread-one' } }
            : {};
      queueMicrotask(() => {
        server.stdout.write(JSON.stringify({ id: call.id, result }) + '\n');
        if (call.method === 'turn/start') {
          server.stdout.write(
            JSON.stringify({
              method: 'turn/started',
              params: { threadId: 'thread-one', turn: { id: 'turn-one' } },
            }) + '\n',
          );
          queueMicrotask(() => turn.controller.abort());
        }
        if (call.method === 'turn/interrupt') server.emit('exit', 1);
      });
    });
    fake.spawn.mockReturnValue(server);
    await expect(runCodex(turn, '/tmp')).rejects.toThrow('did not acknowledge cancellation');
  });
});
