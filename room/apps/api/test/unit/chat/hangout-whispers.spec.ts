import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrivateClientFactory } from '../../../src/memory/room-memory.js';
import type { HonchoClient } from '../../../src/memory/honcho-client.js';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import type { ParticipantBinding, SeatId } from '../../../src/runs/run.contract.js';

describe('hangout whisper delivery', () => {
  let root: string, store: ChatStore, chat: ChatService;
  let privateRun: (context: TurnContext) => Promise<void>;
  const callers = new Map<SeatId, TurnContext>();
  const finish = new Map<SeatId, (error?: Error) => void>();
  const privateFactory = vi.fn<PrivateClientFactory>();
  const publicAppend = vi.fn<HonchoClient['append']>(async () => {});
  const privateSearch = vi.fn<HonchoClient['searchMessages']>(async () => []);
  const privateAppend = vi.fn<HonchoClient['append']>(async () => {});
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'room-whisper-'));
    store = new ChatStore(join(root, 'chat.sqlite'), root);
    callers.clear();
    finish.clear();
    vi.clearAllMocks();
    privateFactory.mockImplementation(() => ({
      append: privateAppend,
      searchMessages: privateSearch,
    }));
    store.runs.enableMemory(
      { append: publicAppend, searchMessages: async () => [] },
      privateFactory,
    );
    const factory = (binding: ParticipantBinding): AgentRuntime => ({
      info: {
        ...binding.config,
        id: binding.role,
        name: binding.role,
        status: 'ready',
        runtime: 'fixture',
      },
      run: async (ctx) => {
        if (binding.id.startsWith('whisper:')) return privateRun(ctx);
        const seat = binding.role as SeatId;
        callers.set(seat, ctx);
        await new Promise<void>((resolve, reject) => {
          finish.set(seat, (error) => (error ? reject(error) : resolve()));
          ctx.controller.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
    });
    const id = store.runs.currentId();
    chat = ChatService.forTest(
      store,
      { a: factory(store.runs.binding(id, 'a')), b: factory(store.runs.binding(id, 'b')) },
      root,
      { runtimeFactory: factory },
    );
  });
  afterEach(async () => {
    await chat.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
  });
  async function post(seat: SeatId) {
    const run = chat.hangout();
    chat.submitMessage(
      seat,
      {
        text: 'Room topic',
        requestId: 'fixture-broadcast-' + seat,
        broadcastId: 'fixture-broadcast',
        expectedRevision: run.revision,
        intent: 'queue',
      },
      run.id,
    );
    await vi.waitFor(() => expect(callers.has(seat)).toBe(true));
    return callers.get(seat)!;
  }
  function visible() {
    const run = chat.hangout().id;
    return JSON.stringify([
      chat.correspondence(run),
      chat.snapshot('a', run),
      chat.snapshot('b', run),
      chat.sideSnapshot(run, 'a'),
      chat.sideSnapshot(run, 'b'),
      store.forRun(run).history('a'),
      store.forRun(run).history('b'),
      publicAppend.mock.calls,
    ]);
  }
  it('returns a private answer to its caller and keeps whisper contents out of all room-facing records', async () => {
    let offered: string[] = [];
    privateRun = async (ctx) => {
      offered = (ctx.tools ?? []).map((t) => t.name);
      await ctx.tool('recall_room', { query: 'secret-recall' });
      ctx.append('secret-answer');
    };
    const astra = await post('a');
    expect(astra.tools?.map((t) => t.name)).toContain('whisper_peer');
    expect(JSON.parse(await astra.tool('whisper_peer', { text: 'secret-question' }))).toMatchObject(
      { reply: 'secret-answer', private: true },
    );
    expect(offered).toEqual(['recall_room']);
    expect(privateSearch).toHaveBeenCalledWith('secret-recall', ['hangout'], 5);
    await expect(astra.tool('whisper_peer', { text: 'secret-failed-retry' })).rejects.toThrow(
      /already/,
    );
    finish.get('a')!(new Error('provider error containing secret-answer'));
    await vi.waitFor(() =>
      expect(chat.snapshot('a', 'hangout').error).toContain('private exchange'),
    );
    await vi.waitFor(() =>
      expect(JSON.stringify(privateAppend.mock.calls)).toContain('secret-answer'),
    );
    expect(privateFactory.mock.calls.map(([name]) => name)).toEqual(['pair-astra-fable']);
    expect(visible()).not.toMatch(/secret-|whisper_peer/);
  });
  it('interrupts an incoming whisper on departure and does not replay it after reinvitation', async () => {
    const received: TurnContext[] = [];
    privateRun = async (ctx) => {
      received.push(ctx);
      await new Promise<void>((resolve) =>
        ctx.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };
    const astra = await post('a'),
      fable = await post('b');
    const pending = astra.tool('whisper_peer', { text: 'secret-pending' });
    const departed = fable.tool('leave_room', {});
    expect(received).toHaveLength(1);
    await expect(pending).rejects.toThrow(/could not be completed/);
    await departed;
    expect(received[0]!.controller.signal.aborted).toBe(true);
    await expect(astra.tool('whisper_peer', { text: 'secret-while-away' })).rejects.toThrow(/away/);
    chat.inviteHangout('b');
    await expect(astra.tool('whisper_peer', { text: 'secret-pending' })).rejects.toThrow(/already/);
    expect(received).toHaveLength(1);
    expect(visible()).not.toMatch(/secret-|whisper_peer/);
  });
});
