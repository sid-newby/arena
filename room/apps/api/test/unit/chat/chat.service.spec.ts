import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentId, AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
function runtime(run: (context: TurnContext) => Promise<void>): AgentRuntime {
  return {
    info: {
      id: 'b',
      name: 'B',
      provider: 'anthropic',
      effort: 'high',
      model: 'test',
      runtime: 'test',
      status: 'ready',
    },
    run,
  };
}
describe('Room chat', () => {
  let directory: string;
  let service: ChatService;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'room-chat-'));
  });
  afterEach(async () => {
    await service?.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
  });
  function setup(run: (context: TurnContext) => Promise<void>) {
    const adapter = runtime(run);
    service = ChatService.forTest(
      new ChatStore(join(directory, 'chat.sqlite')),
      { b: adapter, a: adapter },
      directory,
    );
    return adapter;
  }
  it('streams snapshots, persists replies and sessions, and never displays the human prompt', async () => {
    setup(async (context) => {
      context.append('Hello');
      context.saveSession('provider-session');
    });
    const snapshots: string[] = [];
    const subscription = service
      .events('b')
      .subscribe((event) => snapshots.push(event.data.status));
    await service.submit('b', { requestId: 'request-1', text: 'private user text' });
    await settle();
    expect(service.snapshot('b')).toMatchObject({
      status: 'idle',
      messages: [{ text: 'Hello', status: 'completed' }],
    });
    expect(snapshots).toContain('working');
    subscription.unsubscribe();
    await service.onModuleDestroy();
    const store = new ChatStore(join(directory, 'chat.sqlite'));
    expect(store.session('b')).toBe('provider-session');
    service = ChatService.forTest(
      store,
      { b: runtime(async () => {}), a: runtime(async () => {}) },
      directory,
    );
    expect(service.snapshot('b').messages[0].text).toBe('Hello');
  });
  it('supplies retained history when upgrading a version 2 Luna session', async () => {
    const store = new ChatStore(join(directory, 'chat.sqlite'));
    store.setSession('a', 'version-two-session', 2);
    store.create('earlier-turn', 'a', 'earlier-request', 'Face peer');
    store.append('earlier-turn', 'Facing peer.');
    store.tool('earlier-turn', 'face_panel', { target: 'peer' }, 'Turned right.');
    store.finish('earlier-turn', 'completed');
    const adapter = runtime(async (context) => {
      expect(context.session).toBe('version-two-session');
      expect(context.toolVersion).toBe(2);
      expect(context.priorHistory).toEqual([
        {
          prompt: 'Face peer',
          text: 'Facing peer.',
          status: 'completed',
          tools: [{ name: 'face_panel', input: '{"target":"peer"}', output: 'Turned right.' }],
        },
      ]);
      context.saveSession('version-three-session', 3);
      context.append('Amused.');
    });
    service = ChatService.forTest(store, { a: adapter, b: adapter }, directory);
    await service.submit('a', { requestId: 'upgrade-request', text: 'Try amused' });
    await settle();
    expect(store.session('a')).toBe('version-three-session');
    expect(store.toolVersion('a')).toBe(3);
    expect(service.snapshot('a')).toMatchObject({
      status: 'idle',
      messages: [{ text: 'Facing peer.' }, { text: 'Amused.' }],
    });
  });
  it('deduplicates submissions before and after completion, rejects mismatched reuse', async () => {
    const run = vi.fn<(context: TurnContext) => Promise<void>>(async (context) => {
      context.append('once');
    });
    setup(run);
    const input = { requestId: 'request-1', text: 'hello' };
    const first = await service.submit('b', input);
    expect(await service.submit('b', input)).toEqual(first);
    await settle();
    expect(await service.submit('b', input)).toEqual(first);
    expect(run).toHaveBeenCalledTimes(1);
    await expect(service.submit('b', { ...input, text: 'different' })).rejects.toThrow(
      'different text',
    );
  });
  it('cancels an active turn and prevents overlapping submissions', async () => {
    setup(async (context) => {
      context.append('partial');
      await new Promise<void>((resolve) =>
        context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      context.append('stale');
    });
    await service.submit('b', { requestId: 'request-1', text: 'hello' });
    await settle();
    await expect(service.submit('b', { requestId: 'request-2', text: 'hello' })).rejects.toThrow(
      'already replying',
    );
    await service.stop('b');
    expect(service.snapshot('b')).toMatchObject({
      status: 'idle',
      messages: [{ text: 'partial', status: 'stopped' }],
    });
  });
  it.each(['a', 'b'] as const)(
    'releases seat %s after a durable start write fails without invoking its provider',
    async (seat) => {
      const execute = vi.fn<AgentRuntime['run']>(async () => {});
      setup(execute);
      const db = new DatabaseSync(join(directory, 'chat.sqlite'));
      try {
        db.exec(`CREATE TRIGGER fail_started BEFORE UPDATE OF started_at ON state_attempts
          BEGIN SELECT RAISE(ABORT, 'started metadata fault'); END`);
        const first = await service.submit(seat, { requestId: 'start-failure', text: 'first' });
        await expect(service.stop(seat)).resolves.toMatchObject({
          messages: [{ id: first.turnId, status: 'failed' }],
        });
        expect(execute).not.toHaveBeenCalled();
        expect(service.busy(service.currentRun().id)).toBe(false);
        expect(
          service.workflowPersistence().state.get(service.currentRun().id).attempts[0],
        ).toMatchObject({
          status: 'failed',
          startedAt: null,
          finishedAt: expect.any(Number),
        });
        db.exec('DROP TRIGGER fail_started');
        await service.submit(seat, { requestId: 'after-start-failure', text: 'retry' });
        await settle();
        expect(execute).toHaveBeenCalledOnce();
        expect(service.snapshot(seat).messages.at(-1)?.status).toBe('completed');
      } finally {
        db.close();
      }
    },
  );
  it('records runtime failure and makes authentication failures unavailable', async () => {
    setup(async () => {
      throw new Error('401 Unauthorized. Sign in again.');
    });
    await service.submit('b', { requestId: 'request-1', text: 'hello' });
    await settle();
    expect(service.snapshot('b')).toMatchObject({
      status: 'failed',
      error: '401 Unauthorized. Sign in again.',
      messages: [{ status: 'failed' }],
    });
    expect(service.list().agents[0].status).toBe('unavailable');
    await expect(service.submit('b', { requestId: 'request-2', text: 'hello' })).rejects.toThrow(
      'Sign in again',
    );
  });
  it('validates command boundaries and rejects arbitrary tools', async () => {
    setup(async (context) => {
      await expect(context.tool('shell', { command: 'pwd' })).rejects.toThrow('outside');
      await expect(context.tool('set_pose', { pose: 'javascript' })).rejects.toThrow('outside');
      await expect(context.tool('face_panel', { target: 'other' })).rejects.toThrow('outside');
      await expect(context.tool('face_panel', { target: 'peer', agent: 'a' })).rejects.toThrow(
        'outside',
      );
      await context.tool('set_pose', { pose: 'left' });
    });
    expect(() => service.agent('scout')).toThrow('Unknown agent');
    await expect(service.submit('b', { requestId: 'short', text: '' })).rejects.toThrow(
      'Provide text',
    );
    await expect(
      service.submit('b', { requestId: 'request-1', text: 'x'.repeat(16001) }),
    ).rejects.toThrow('Provide text');
    await service.submit('b', { requestId: 'request-1', text: 'look left' });
    await settle();
    expect(service.snapshot('b').pose).toBe('left');
    const failures = service
      .correspondence(service.currentRun().id)
      .events.filter((event) => event.kind === 'tool.failed');
    expect(failures).toHaveLength(4);
    expect(failures[0]).toMatchObject({
      role: 'b',
      payload: {
        name: 'shell',
        input: '{"command":"pwd"}',
        error: 'Tool request is outside the permitted room tools.',
      },
    });
  });
  it.each([
    ['a', 'peer', 'right'],
    ['b', 'peer', 'left'],
    ['a', 'audience', 'front'],
    ['b', 'audience', 'front'],
    ['a', 'center', 'front'],
    ['b', 'center', 'front'],
  ] as const)(
    'turns %s toward %s using %s without moving the other panel',
    async (agent, target, pose) => {
      setup(async (context) => {
        await context.tool('set_pose', { pose: 'left' });
        await context.tool('face_panel', { target });
      });
      await service.submit(agent, { requestId: 'request-1', text: `Face ${target}` });
      await settle();
      expect(service.snapshot(agent)).toMatchObject({ pose, poseRevision: 2, status: 'idle' });
      const peer: AgentId = agent === 'a' ? 'b' : 'a';
      expect(service.snapshot(peer).pose).toBe('front');
    },
  );
  it('expresses, changes pose during the effect, clears, and logs accepted and cooldown results', async () => {
    const outputs: string[] = [];
    setup(async (context) => {
      outputs.push(await context.tool('express', { mood: 'annoyed', duration: 1500 }));
      expect(service.snapshot('b').expression?.mood).toBe('annoyed');
      expect(service.snapshot('a').expression).toBeNull();
      await context.tool('face_panel', { target: 'peer' });
      outputs.push(await context.tool('express', { mood: 'grumpy' }));
      await context.tool('clear_expression', {});
      expect(service.snapshot('b')).toMatchObject({
        pose: 'left',
        poseRevision: 1,
        expression: null,
      });
    });
    await service.submit('b', {
      requestId: 'request-express',
      text: 'Express then face peer and clear',
    });
    await settle();
    expect(outputs.map((output) => JSON.parse(output).status)).toEqual(['accepted', 'cooldown']);
    expect(service.snapshot('b').status).toBe('idle');
    const db = new DatabaseSync(join(directory, 'chat.sqlite'));
    const calls = db.prepare('SELECT name,output FROM tool_calls ORDER BY id').all();
    expect(calls.map((call) => call.name)).toEqual([
      'express',
      'face_panel',
      'express',
      'clear_expression',
    ]);
    expect(JSON.parse(String(calls[2].output))).toMatchObject({
      accepted: false,
      status: 'cooldown',
    });
    db.close();
  });
  it('expires temporary expressions at the latest pose and clears transient state after restart', async () => {
    vi.useFakeTimers();
    try {
      setup(async (context) => {
        await context.tool('express', { mood: 'grumpy', duration: 150 });
        await context.tool('face_panel', { target: 'peer' });
      });
      await service.submit('b', { requestId: 'request-expiry', text: 'Express and turn' });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.snapshot('b')).toMatchObject({
        expression: { mood: 'grumpy' },
        pose: 'left',
      });
      await vi.advanceTimersByTimeAsync(150);
      expect(service.snapshot('b')).toMatchObject({ expression: null, pose: 'left' });
      await service.submit('a', {
        requestId: 'request-restart',
        text: 'Express before restart',
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.snapshot('a').expression?.mood).toBe('grumpy');
      await service.onModuleDestroy();
      service = ChatService.forTest(
        new ChatStore(join(directory, 'chat.sqlite')),
        { a: runtime(async () => {}), b: runtime(async () => {}) },
        directory,
      );
      expect(service.snapshot('a')).toMatchObject({ expression: null, pose: 'right' });
      expect(service.snapshot('a').messages).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects cross-panel expression arguments and arbitrary expression definitions', async () => {
    setup(async (context) => {
      await expect(context.tool('express', { mood: 'annoyed', agent: 'a' })).rejects.toThrow(
        'Invalid expression',
      );
      await expect(context.tool('express', { mood: 'annoyed', css: 'transform' })).rejects.toThrow(
        'Invalid expression',
      );
      await expect(context.tool('clear_expression', { agent: 'a' })).rejects.toThrow(
        'no arguments',
      );
    });
    await service.submit('b', { requestId: 'request-express', text: 'Invalid expressions' });
    await settle();
    expect(service.snapshot('b').expression).toBeNull();
    expect(service.snapshot('a').expression).toBeNull();
    expect(service.snapshot('b').status).toBe('idle');
  });
  it('marks interrupted persisted work failed after restart without replaying it', async () => {
    const path = join(directory, 'chat.sqlite');
    const first = new ChatStore(path);
    first.create('turn', 'b', 'request-1', 'hello');
    first.append('turn', 'partial');
    first.close();
    const second = new ChatStore(path);
    service = ChatService.forTest(
      second,
      { b: runtime(async () => {}), a: runtime(async () => {}) },
      directory,
    );
    expect(service.snapshot('b')).toMatchObject({
      status: 'failed',
      messages: [{ text: 'partial', status: 'failed' }],
    });
    expect(await service.submit('b', { requestId: 'request-1', text: 'hello' })).toEqual({
      turnId: 'turn',
    });
  });
});
