import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentRuntime } from '../../../src/chat/chat.types.js';
import type { HonchoClient, HonchoMessage } from '../../../src/memory/honcho-client.js';
import type { ParticipantBinding } from '../../../src/runs/run.contract.js';

const mockClient = () => ({
  append: vi.fn<HonchoClient['append']>().mockResolvedValue(undefined),
  searchMessages: vi.fn<HonchoClient['searchMessages']>().mockResolvedValue([]),
});

function runtime(binding: ParticipantBinding, whisper?: AgentRuntime['run']): AgentRuntime {
  return {
    info: {
      ...binding.config,
      id: binding.role,
      name: binding.role,
      runtime: 'fixture',
      status: 'ready',
    },
    async run(context) {
      if (context.mode === 'side' && whisper) return whisper(context);
      context.append(
        context.mode === 'side' ? 'Private answer' : `Public reply from ${binding.config.model}`,
      );
    },
  };
}

it('recovers only new public hangout messages after a failed export and restart, preserving authors and broadcast identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-memory-'));
  const path = join(root, 'chat.sqlite');
  const sent: HonchoMessage[] = [];
  const append = vi
    .fn<HonchoClient['append']>(async (runId, batch) => {
      expect(runId).toBe('hangout');
      sent.push(...batch);
    })
    .mockRejectedValueOnce(new Error('Service offline'));
  const client = { append, searchMessages: vi.fn<HonchoClient['searchMessages']>() };
  const open = () => {
    const store = new ChatStore(path, root);
    const { id, revision } = store.runs.ensureHangout();
    const chat = ChatService.forTest(
      store,
      {
        a: runtime(store.runs.binding(id, 'a')),
        b: runtime(store.runs.binding(id, 'b')),
      },
      root,
    );
    return { store, chat, id, revision };
  };
  const initial = open();
  const { id, revision } = initial;
  let { store, chat } = initial;
  try {
    chat.submitMessage(
      'a',
      {
        requestId: 'old-public-a',
        broadcastId: 'old-public',
        expectedRevision: revision,
        intent: 'queue',
        text: 'Before capture was enabled',
      },
      id,
    );
    await vi.waitFor(() => expect(chat.busy(id)).toBe(false));
    store.runs.enableMemory(client);
    chat.submitSide(id, 'a', {
      requestId: 'side-only',
      expectedRevision: revision,
      text: 'Private question',
    });
    const broadcastId = 'sid-broadcast';
    for (const seat of ['a', 'b'] as const) {
      const body = {
        text: 'Hello to both of you',
        requestId: `${broadcastId}-${seat}`,
        broadcastId,
        expectedRevision: revision,
        intent: 'queue',
      };
      const accepted = chat.submitMessage(seat, body, id);
      expect(chat.submitMessage(seat, body, id).id).toBe(accepted.id);
    }
    await vi.waitFor(() => {
      expect(chat.sideSnapshot(id, 'a').messages[0]).toMatchObject({
        status: 'completed',
        text: 'Private answer',
      });
      expect(chat.hangoutMemoryStatus()).toMatchObject({ retrying: true, pending: 3, sent: 0 });
    });
    await chat.onModuleDestroy();
    ({ store, chat } = open());
    store.runs.enableMemory(client);
    await vi.waitFor(() =>
      expect(chat.hangoutMemoryStatus()).toMatchObject({ pending: 0, sent: 3 }),
    );
    expect(sent).toHaveLength(3);
    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          peerId: 'sid',
          content: 'Hello to both of you',
          metadata: expect.objectContaining({ recipient_seat: 'both' }),
        }),
        expect.objectContaining({
          peerId: 'astra',
          content: 'Public reply from gpt-6-astra',
          metadata: expect.objectContaining({ seat: 'a', provider: 'codex' }),
        }),
        expect.objectContaining({
          peerId: 'fable',
          content: 'Public reply from claude-fable-5-1',
          metadata: expect.objectContaining({ seat: 'b', provider: 'anthropic' }),
        }),
      ]),
    );
  } finally {
    await chat.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
  }
});

it('recalls and exports each hangout whisper only through the client for the speaking participant', async () => {
  const root = mkdtempSync(join(tmpdir(), 'arena-whisper-'));
  const store = new ChatStore(join(root, 'chat.sqlite'), root);
  const { id, revision } = store.runs.ensureHangout();
  const publicClient = mockClient();
  const whisperClients = { astra: mockClient(), fable: mockClient() };
  store.runs.enableMemory(publicClient, (peerId) => {
    if (peerId === 'astra' || peerId === 'fable') return whisperClients[peerId];
    throw new Error('Unknown peer');
  });
  const whispered: string[] = [];
  const whisper: AgentRuntime['run'] = async (turn) => {
    whispered.push(turn.instructions!);
    expect(turn.tools?.map((tool) => tool.name)).toEqual(['recall_room']);
    await turn.tool('recall_room', { query: turn.text });
    await expect(turn.tool('address_panelist', { recipient: 'b' })).rejects.toThrow(/unavailable/);
    turn.append('Private answer');
  };
  const chat = ChatService.forTest(
    store,
    {
      a: runtime(store.runs.binding(id, 'a'), whisper),
      b: runtime(store.runs.binding(id, 'b'), whisper),
    },
    root,
  );
  try {
    for (const [seat, name] of [
      ['a', 'astra'],
      ['b', 'fable'],
    ] as const) {
      chat.submitSide(id, seat, {
        text: 'Personal note for ' + name,
        requestId: 'private-' + seat,
        expectedRevision: revision,
      });
    }
    await vi.waitFor(() => {
      for (const [seat, name] of [
        ['a', 'astra'],
        ['b', 'fable'],
      ] as const) {
        expect(chat.sideSnapshot(id, seat).messages[0]).toMatchObject({
          status: 'completed',
          text: 'Private answer',
        });
        expect(whisperClients[name].searchMessages.mock.calls.map(([query]) => query)).toEqual([
          'Personal note for ' + name,
        ]);
        const exported = whisperClients[name].append.mock.calls.flatMap(([, batch]) => batch);
        expect(exported.map((message) => [message.peerId, message.content])).toEqual([
          ['sid', 'Personal note for ' + name],
          [name, 'Private answer'],
        ]);
      }
    });
    expect(
      whispered.some((text) => text.includes('You are Astra, whispering privately with Sid')),
    ).toBe(true);
    expect(
      whispered.some((text) => text.includes('You are Fable, whispering privately with Sid')),
    ).toBe(true);
    expect(publicClient.append).not.toHaveBeenCalled();
    expect(publicClient.searchMessages).not.toHaveBeenCalled();
    const events = JSON.stringify(chat.correspondence(id).events);
    expect(events).not.toContain('Personal note');
    expect(events).not.toContain('Private answer');
  } finally {
    await chat.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
  }
});
