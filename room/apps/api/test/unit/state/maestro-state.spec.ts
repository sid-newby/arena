import { Logger } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import { MaestroService } from '../../../src/maestro/maestro.service.js';
import { MaestroStore } from '../../../src/maestro/maestro.store.js';
import type { UsageObservation } from '../../../src/state/state.contract.js';
import { unknownTokens } from '../../../src/state/state.contract.js';
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function runtime(run: AgentRuntime['run']): AgentRuntime {
  return {
    info: {
      id: 'maestro',
      provider: 'codex',
      model: 'gpt-6.1-sol',
      effort: 'high',
      name: 'Maestro',
      runtime: 'test',
      status: 'ready',
    },
    run,
  };
}
describe('Maestro shared state and private terminal recovery', () => {
  let root: string,
    chatStore: ChatStore,
    chat: ChatService,
    privateStore: MaestroStore,
    maestro: MaestroService | undefined;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'maestro-state-'));
    chatStore = new ChatStore(join(root, 'main.sqlite'), root);
    chat = ChatService.forTest(
      chatStore,
      { a: runtime(async () => {}), b: runtime(async () => {}) },
      root,
    );
    privateStore = new MaestroStore(join(root, 'private.sqlite'));
  });
  afterEach(async () => {
    if (maestro) await maestro.onModuleDestroy();
    else privateStore.close();
    await chat.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
    maestro = undefined;
  });
  function setup(run: AgentRuntime['run']) {
    maestro = MaestroService.forTest({
      chat,
      store: privateStore,
      workspaceRoot: root,
      runtimeFactory: () => runtime(run),
    });
    return maestro;
  }
  const runId = () => chat.currentRun().id;
  function createShared(id: string) {
    const run = chat.currentRun();
    chatStore.runs.state.startAttempt({
      runId: run.id,
      turnId: id,
      binding: chatStore.runs.binding(run.id, 'maestro'),
      configRevision: run.revision,
      trigger: 'human',
      stage: null,
      throughSeq: 0,
    });
  }
  function createPrivate(id: string) {
    privateStore.create({
      id,
      runId: runId(),
      requestId: 'private-' + id,
      prompt: 'PRIVATE-PROMPT',
      throughSeq: 0,
      partialRevisions: [],
      fingerprint: 'private-fingerprint',
    });
  }
  it('drains a privately completed terminal before restart interruption reconciliation and does not replay provider execution', () => {
    createShared('completed-at-crash');
    createPrivate('completed-at-crash');
    privateStore.finish('completed-at-crash', 'completed', undefined, {
      finishedAt: 12345,
      elapsedMs: 15.5,
    });
    createShared('interrupted-at-crash');
    createPrivate('interrupted-at-crash');
    chatStore.runs.state.startTool('interrupted-at-crash', 'get_private_history');
    privateStore.close();
    privateStore = new MaestroStore(join(root, 'private.sqlite'));
    const execute = vi.fn<AgentRuntime['run']>(async () => {});
    setup(execute);
    const attempts = chatStore.runs.state.get(runId()).attempts;
    expect(attempts.find((attempt) => attempt.id === 'completed-at-crash')).toMatchObject({
      status: 'completed',
      finishedAt: 12345,
      elapsedMs: 15.5,
    });
    expect(attempts.find((attempt) => attempt.id === 'interrupted-at-crash')).toMatchObject({
      status: 'interrupted',
      finishedAt: null,
      elapsedMs: null,
      tools: [{ status: 'interrupted', finishedAt: null }],
    });
    expect(privateStore.pendingTerminals()).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it('preserves the server request timestamp separately from runtime start', async () => {
    const service = setup(async () => {});
    const received = vi.spyOn(Date, 'now').mockReturnValueOnce(123);
    await service.submit(runId(), { text: 'request', requestId: 'timing-request' });
    received.mockRestore();
    await settle();
    expect(chatStore.runs.state.get(runId()).attempts[0]).toMatchObject({
      requestedAt: 123,
      startedAt: expect.any(Number),
    });
  });
  it('releases Maestro after a durable start write fails without invoking its provider', async () => {
    const execute = vi.fn<AgentRuntime['run']>(async () => {}),
      service = setup(execute),
      db = new DatabaseSync(join(root, 'main.sqlite'));
    try {
      db.exec(`CREATE TRIGGER fail_started BEFORE UPDATE OF started_at ON state_attempts
        BEGIN SELECT RAISE(ABORT, 'started metadata fault'); END`);
      const first = await service.submit(runId(), { text: 'first', requestId: 'start-failure' });
      await settle();
      expect(execute).not.toHaveBeenCalled();
      expect(service.snapshot(runId())).toMatchObject({
        status: 'failed',
        error: 'started metadata fault',
      });
      expect(privateStore.history(runId())[0].status).toBe('failed');
      expect(chatStore.runs.state.get(runId()).attempts[0]).toMatchObject({
        status: 'failed',
        startedAt: null,
        finishedAt: expect.any(Number),
      });
      db.exec('DROP TRIGGER fail_started');
      expect(await service.stop(runId(), { turnId: first.turnId })).toMatchObject({
        status: 'failed',
      });
      await service.submit(runId(), { text: 'retry', requestId: 'after-start-failure' });
      await settle();
      expect(execute).toHaveBeenCalledOnce();
      expect(privateStore.history(runId()).at(-1)?.status).toBe('completed');
      expect(chatStore.runs.state.get(runId()).attempts.at(-1)?.status).toBe('completed');
    } finally {
      db.close();
    }
  });
  it('never invokes a provider when required shared or private acceptance fails', async () => {
    const execute = vi.fn<AgentRuntime['run']>(async () => {}),
      service = setup(execute);
    const failShared = vi.spyOn(chatStore.runs.state, 'startAttempt').mockImplementationOnce(() => {
      throw new Error('shared insert failed');
    });
    await expect(
      service.submit(runId(), { text: 'secret', requestId: 'shared-failure' }),
    ).rejects.toThrow('shared insert failed');
    expect(privateStore.history(runId())).toHaveLength(0);
    failShared.mockRestore();
    vi.spyOn(privateStore, 'create').mockImplementationOnce(() => {
      throw new Error('private insert failed');
    });
    await expect(
      service.submit(runId(), { text: 'secret', requestId: 'private-failure' }),
    ).rejects.toThrow('private insert failed');
    expect(chatStore.runs.state.get(runId()).attempts).toMatchObject([{ status: 'failed' }]);
    expect(execute).not.toHaveBeenCalled();
  });
  it('retains a private terminal when public terminal delivery fails and reconciles it before interruption', async () => {
    const execute = vi.fn<AgentRuntime['run']>(async () => {}),
      service = setup(execute);
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const finish = vi.spyOn(chatStore.runs.state, 'finishAttempt').mockImplementation(() => {
      throw new Error('main database unavailable');
    });
    await service.submit(runId(), { text: 'secret', requestId: 'outbox-retry' });
    await settle();
    expect(privateStore.history(runId())[0].status).toBe('completed');
    expect(privateStore.pendingTerminals()).toHaveLength(1);
    expect(service.snapshot(runId())).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('metadata'),
    });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
    finish.mockRestore();
    setup(execute);
    expect(chatStore.runs.state.get(runId()).attempts[0].status).toBe('completed');
    expect(privateStore.pendingTerminals()).toHaveLength(0);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each(['success', 'failure', 'stop'] as const)(
    'records %s timing, partial usage, private tool metadata and one attempt for a retried request',
    async (kind) => {
      const usage: UsageObservation = {
        key: 'partial',
        source: 'anthropic.result.usage',
        scope: 'turn',
        coverage: 'main-loop',
        completeness: 'partial',
        requestedModel: 'gpt-6.1-sol',
        actualModel: null,
        tokens: { ...unknownTokens(), outputTokens: 3 },
        costUsd: null,
        providerDurationMs: null,
      };
      const execute = vi.fn<AgentRuntime['run']>(async (context: TurnContext) => {
        context.usage?.(usage);
        context.usage?.(usage);
        context.append('PRIVATE-RESPONSE');
        context.saveSession('PRIVATE-CONTINUATION');
        if (kind === 'failure') await context.tool('get_private_history', { offset: -1 });
        else await context.tool('get_private_history', {});
        if (kind === 'stop')
          await new Promise<void>((resolve) =>
            context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
          );
      });
      const service = setup(execute),
        body = { text: 'PRIVATE-PROMPT', requestId: 'private-request' };
      const first = await service.submit(runId(), body);
      await settle();
      expect(await service.submit(runId(), body)).toEqual(first);
      if (kind === 'stop') await service.stop(runId(), { turnId: first.turnId });
      const raw = chatStore.runs.state.get(runId()),
        attempt = raw.attempts[0];
      expect(raw.attempts).toHaveLength(1);
      expect(execute).toHaveBeenCalledOnce();
      expect(attempt).toMatchObject({
        role: 'maestro',
        provider: 'codex',
        model: 'gpt-6.1-sol',
        status: kind === 'success' ? 'completed' : kind === 'failure' ? 'failed' : 'stopped',
        usage: [usage],
        tokens: { outputTokens: 3 },
        tools: [
          { name: 'get_private_history', status: kind === 'failure' ? 'failed' : 'succeeded' },
        ],
      });
      expect(attempt.requestedAt).toEqual(expect.any(Number));
      expect(attempt.startedAt).toEqual(expect.any(Number));
      expect(attempt.firstTextAt).toEqual(expect.any(Number));
      expect(attempt.finishedAt).toEqual(expect.any(Number));
      expect(attempt.elapsedMs).toBeGreaterThanOrEqual(0);
      for (const secret of ['PRIVATE-PROMPT', 'PRIVATE-RESPONSE', 'PRIVATE-CONTINUATION'])
        expect(JSON.stringify(raw)).not.toContain(secret);
    },
  );
});
