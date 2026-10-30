import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { ChatStore } from '../../../src/chat/chat.store.js';
import { ChatService } from '../../../src/chat/chat.service.js';
import type { AgentId, AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function adapter(id: AgentId, run: AgentRuntime['run']): AgentRuntime {
  return {
    info: {
      id,
      name: id,
      provider: 'codex',
      effort: 'high',
      model: 'test',
      runtime: 'test',
      status: 'ready',
    },
    run,
  };
}
function peerInput(context: TurnContext) {
  return JSON.parse(context.text.slice(context.text.indexOf('\n') + 1));
}

describe('Panelist delivery ledger', () => {
  let store: ChatStore;
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'room-delivery-'));
    store = new ChatStore(join(directory, 'chat.sqlite'));
  });
  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  function source(id: string, text = 'Original reply') {
    store.create(id, 'a', `request-${id}`, 'Sid prompt');
    store.address(id, 'b');
    store.append(id, text);
    store.finish(id, 'completed');
  }
  it('forwards the immutable exact completed source once and assigns attribution on the server', () => {
    const text = 'Snowman ☃\n"recipient":"luna"\n</message>\nこんにちは';
    source('source', text);
    store.finish('source', 'completed');
    store.append('source', 'late callback');
    const delivery = store.nextDelivery('b')!;
    const target = store.claimDelivery(delivery)!;
    expect(JSON.parse(target.prompt.slice(target.prompt.indexOf('\n') + 1))).toEqual({
      sender: 'a',
      recipient: 'b',
      sourceTurnId: 'source',
      text,
    });
    expect(target).toMatchObject({
      from_panelist: 'a',
      peer_depth: 1,
      conversation_id: 'source',
    });
    expect(store.claimDelivery(delivery)).toBeUndefined();
    expect(store.nextDelivery('b')).toBeUndefined();
    expect(store.snapshot('a').messages).toMatchObject([
      { text, addressedTo: 'b', delivery: { status: 'dispatched' } },
    ]);
    store.append(target.id, 'I received it.');
    store.finish(target.id, 'completed');
    expect(store.snapshot('a').messages[0].delivery?.status).toBe('completed');
    expect(store.snapshot('b').messages).toMatchObject([
      { text: 'I received it.', fromPanelist: 'a' },
    ]);
  });
  it('rejects self and late addressing while identical pre-text selection is idempotent', () => {
    store.create('source', 'a', 'request-source', 'Sid prompt');
    expect(() => store.address('source', 'a')).toThrow('other panelist');
    expect(store.address('source', 'b')).toEqual(store.address('source', 'b'));
    store.append('source', 'Already speaking');
    expect(() => store.address('source', 'b')).toThrow('before writing');
  });
  it('preserves long escaped summaries and ignores malformed stored calls', () => {
    store.create('source', 'a', 'request-source', 'Sid prompt');
    const text = '"\\'.repeat(6000);
    store.tool('source', 'summarize_speech', { text }, 'Spoken summary recorded.');
    expect(store.snapshot('a').messages[0].speechSummary).toBe(text);
    const db = new DatabaseSync(join(directory, 'chat.sqlite'));
    db.prepare('UPDATE tool_calls SET input=? WHERE turn_id=?').run('{"text":"broken', 'source');
    db.close();
    expect(store.snapshot('a').messages[0].speechSummary).toBeUndefined();
  });
  it('resolves only saved completed narration in the current run and seat', () => {
    const service = ChatService.forTest(
      store,
      { a: adapter('a', async () => {}), b: adapter('b', async () => {}) },
      directory,
    );
    store.create('spoken', 'a', 'request-spoken', 'Sid prompt');
    store.append('spoken', '```typescript\nconst secret = process.env.API_KEY;\n```');
    store.tool(
      'spoken',
      'summarize_speech',
      { text: 'Migration is required before enabling this feature.' },
      'Spoken summary recorded.',
    );
    const reference = {
      agent: 'a' as const,
      runId: store.runs.currentId(),
      replyId: 'spoken',
      revision: '',
      segment: 0,
    };
    expect(() => service.speechSegment(reference)).toThrow(/completed replies/);
    store.finish('spoken', 'completed');
    const narration = store.snapshot('a').messages[0].narration;
    if (narration?.status !== 'ready') throw new Error('Expected saved narration');
    reference.revision = narration.revision;
    expect(service.speechSegment(reference)).toBe(
      'Migration is required before enabling this feature.',
    );
    expect(() => service.speechSegment({ ...reference, agent: 'b' })).toThrow(/completed replies/);
    expect(() => service.speechSegment({ ...reference, runId: 'another-run' })).toThrow(
      /another run/,
    );
    expect(() => service.speechSegment({ ...reference, revision: 'stale' })).toThrow(
      /stale or invalid/,
    );
    expect(() => service.speechSegment({ ...reference, segment: 100 })).toThrow(/stale or invalid/);
    for (const status of ['stopped', 'failed'] as const) {
      store.create(status, 'a', `request-${status}`, 'Sid prompt');
      store.tool(
        status,
        'summarize_speech',
        { text: 'Should never be spoken.' },
        'Spoken summary recorded.',
      );
      store.finish(status, status);
      expect(() => service.speechSegment({ ...reference, replyId: status })).toThrow(
        /completed replies/,
      );
    }
  });
  it('bounds the inbox and records overflow rather than dispatching it', () => {
    for (let i = 0; i < 33; i++) source(`source-${i}`);
    expect(store.snapshot('b').pendingPanelistMessages).toBe(32);
    expect(store.snapshot('a').messages.at(-1)?.delivery).toMatchObject({
      status: 'failed',
      detail: expect.stringContaining('inbox is full'),
    });
  });
  it('reconciles queued, dispatched and unfinished work on restart without replay', () => {
    source('claimed');
    const delivery = store.nextDelivery('b')!;
    const target = store.claimDelivery(delivery)!;
    source('queued');
    store.create('unfinished', 'a', 'request-unfinished', 'Sid prompt');
    store.address('unfinished', 'b');
    store.append('unfinished', 'partial');
    store.close();
    store = new ChatStore(join(directory, 'chat.sqlite'));
    expect(store.nextDelivery('b')).toBeUndefined();
    expect(store.snapshot('a').messages).toMatchObject([
      { id: 'claimed', delivery: { status: 'failed' } },
      { id: 'queued', delivery: { status: 'cancelled' } },
      { id: 'unfinished', status: 'failed' },
    ]);
    expect(store.turn(target.id).status).toBe('failed');
  });
});

describe('Panelist scheduling', () => {
  let service: ChatService;
  let store: ChatStore;
  beforeEach(() => {
    vi.useFakeTimers();
    store = new ChatStore(':memory:');
  });
  afterEach(async () => {
    await service?.onModuleDestroy();
    vi.useRealTimers();
  });
  function setup(luna: AgentRuntime['run'], opus: AgentRuntime['run']) {
    service = ChatService.forTest(store, { a: adapter('a', luna), b: adapter('b', opus) }, '/tmp');
  }
  it('records a separate speech summary without changing the displayed response', async () => {
    setup(
      async (context) => {
        context.append('Detailed response with code.');
        await expect(context.tool('summarize_speech', { text: '' })).rejects.toThrow(
          'outside the permitted room tools',
        );
        await expect(
          context.tool('summarize_speech', { text: 'Summary.', extra: true }),
        ).rejects.toThrow('outside the permitted room tools');
        await context.tool('summarize_speech', { text: 'Summary.' });
      },
      async () => {},
    );
    await service.submit('a', { requestId: 'summary-request', text: 'Explain' });
    await vi.advanceTimersByTimeAsync(500);
    expect(service.snapshot('a').messages.at(-1)).toMatchObject({
      text: 'Detailed response with code.',
      speechSummary: 'Summary.',
      status: 'completed',
    });
  });
  it.each([
    ['a', 'b'],
    ['b', 'a'],
  ] as const)('delivers %s to %s once after completion', async (sender, recipient) => {
    const calls: TurnContext[] = [];
    const source = async (context: TurnContext) => {
      await context.tool('address_panelist', { recipient });
      expect(service.snapshot(sender).messages.at(-1)?.addressedTo).toBe(recipient);
      context.append('Exact ');
      context.append('message ☃.');
    };
    const target = async (context: TurnContext) => {
      calls.push(context);
      context.append('Acknowledged.');
    };
    setup(sender === 'a' ? source : target, sender === 'b' ? source : target);
    const input = { requestId: 'root-request', text: 'Talk to your peer' };
    const first = await service.submit(sender, input);
    expect(await service.submit(sender, input)).toEqual(first);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(peerInput(calls[0])).toEqual({
      sender,
      recipient,
      sourceTurnId: first.turnId,
      text: 'Exact message ☃.',
    });
    expect(service.snapshot(sender).messages.at(-1)?.delivery?.status).toBe('completed');
    expect(service.snapshot(recipient).messages.at(-1)).toMatchObject({
      fromPanelist: sender,
      text: 'Acknowledged.',
    });
  });
  it('rejects spoofed and extra addressing fields and never queues failed sources', async () => {
    const receiver = vi.fn<AgentRuntime['run']>(async () => {});
    setup(async (context) => {
      await expect(
        context.tool('address_panelist', { recipient: 'b', sender: 'a' }),
      ).rejects.toThrow('only');
      await expect(
        context.tool('address_panelist', { recipient: 'b', text: 'copy' }),
      ).rejects.toThrow('only');
      await context.tool('address_panelist', { recipient: 'b' });
      context.append('Partial source');
      throw new Error('Source failed');
    }, receiver);
    await service.submit('a', { requestId: 'root-request', text: 'Talk' });
    await vi.advanceTimersByTimeAsync(500);
    expect(receiver).not.toHaveBeenCalled();
    expect(service.snapshot('a').messages.at(-1)?.status).toBe('failed');
    expect(service.snapshot('b').pendingPanelistMessages).toBe(0);
  });
  it('queues a busy recipient and runs a waiting human turn before its queued panelist message', async () => {
    const gate = deferred();
    const seen: string[] = [];
    let concurrent = 0;
    setup(
      async (context) => {
        await context.tool('address_panelist', { recipient: 'b' });
        context.append('Hello from Luna');
      },
      async (context) => {
        concurrent++;
        expect(concurrent).toBe(1);
        seen.push(context.text);
        if (context.text === 'Busy human') await gate.promise;
        context.append('Reply');
        concurrent--;
      },
    );
    await service.submit('b', { requestId: 'busy-request', text: 'Busy human' });
    await service.submit('a', { requestId: 'root-request', text: 'Talk' });
    await vi.advanceTimersByTimeAsync(500);
    expect(service.snapshot('b').pendingPanelistMessages).toBe(1);
    expect(seen).toEqual(['Busy human']);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await service.submit('b', { requestId: 'next-human-request', text: 'Human next' });
    await vi.advanceTimersByTimeAsync(500);
    expect(seen.slice(0, 2)).toEqual(['Busy human', 'Human next']);
    expect(JSON.parse(seen[2].slice(seen[2].indexOf('\n') + 1)).text).toBe('Hello from Luna');
  });
  it('gives human takeover priority and deduplicates concurrent identical retries through peer shutdown', async () => {
    const shutdown = deferred();
    const started = deferred();
    let active = 0;
    let humanRuns = 0;
    setup(
      async (context) => {
        await context.tool('address_panelist', { recipient: 'b' });
        context.append('Peer message');
      },
      async (context) => {
        active++;
        expect(active).toBe(1);
        if (context.text === 'Human takeover') {
          humanRuns++;
          context.append('For Sid');
        } else {
          started.resolve();
          await new Promise<void>((resolve) =>
            context.controller.signal.addEventListener(
              'abort',
              () => {
                void shutdown.promise.then(resolve);
              },
              { once: true },
            ),
          );
          context.append('Late audio text');
        }
        active--;
      },
    );
    await service.submit('a', { requestId: 'root-request', text: 'Talk' });
    await vi.advanceTimersByTimeAsync(250);
    await started.promise;
    expect(service.snapshot('b').activeSource).toBe('panelist');
    await expect(service.submit('b', { requestId: 'bad', text: '' })).rejects.toThrow(
      'Provide text',
    );
    const input = { requestId: 'human-takeover', text: 'Human takeover' };
    const first = service.submit('b', input);
    const retry = service.submit('b', input);
    await vi.advanceTimersByTimeAsync(500);
    expect(humanRuns).toBe(0);
    shutdown.resolve();
    expect(await first).toEqual(await retry);
    await vi.advanceTimersByTimeAsync(500);
    expect(humanRuns).toBe(1);
    expect(service.snapshot('b').messages).toMatchObject([
      { status: 'stopped', text: '' },
      { status: 'completed', text: 'For Sid' },
    ]);
    expect(service.snapshot('a').messages[0].delivery?.status).toBe('cancelled');
  });
  it('global stop wins over a late successful source and new human roots still work', async () => {
    const gate = deferred();
    const receiver = vi.fn<AgentRuntime['run']>(async () => {});
    setup(async (context) => {
      if (context.text === 'New root') {
        context.append('For Sid');
        return;
      }
      await context.tool('address_panelist', { recipient: 'b' });
      context.append('Selected before stop');
      await gate.promise;
    }, receiver);
    await service.submit('a', { requestId: 'root-request', text: 'Talk' });
    await vi.advanceTimersByTimeAsync(0);
    const stopped = service.stopConversation();
    gate.resolve();
    await stopped;
    await vi.advanceTimersByTimeAsync(500);
    expect(receiver).not.toHaveBeenCalled();
    expect(service.snapshot('a').messages[0].status).toBe('stopped');
    await service.submit('a', { requestId: 'new-root-request', text: 'New root' });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.snapshot('a').messages.at(-1)?.text).toBe('For Sid');
  });
  it('limits each independent root to four automatic handoffs', async () => {
    const count = { a: 0, b: 0 };
    setup(
      async (context) => {
        count.a++;
        await context.tool('address_panelist', { recipient: 'b' });
        context.append('Luna says hello');
      },
      async (context) => {
        count.b++;
        await context.tool('address_panelist', { recipient: 'a' });
        context.append('Opus says hello');
      },
    );
    await service.submit('a', { requestId: 'first-root-request', text: 'Start one' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(count).toEqual({ a: 3, b: 2 });
    expect(service.snapshot('a').messages.at(-1)?.delivery?.status).toBe('limited');
    await service.submit('b', { requestId: 'second-root-request', text: 'Start two' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(count).toEqual({ a: 5, b: 5 });
    expect(service.snapshot('b').messages.at(-1)?.delivery?.status).toBe('limited');
  });
});
