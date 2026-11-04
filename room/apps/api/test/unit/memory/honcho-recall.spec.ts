import type { HonchoClient } from '../../../src/memory/honcho-client.js';
import { recallRoomMessages } from '../../../src/memory/honcho-recall.js';

const message = {
  id: 'm-7',
  session_id: 'run-1',
  peer_id: 'sid',
  created_at: '2026-11-04T03:20:00Z',
  content: 'Keep this local until review.',
};

describe('Arena memory recall', () => {
  it('does not send a query when no sessions are allowed or the query is invalid', async () => {
    const client = { searchMessages: vi.fn<HonchoClient['searchMessages']>() };
    const output = await recallRoomMessages(client, 'approval', []);
    expect(JSON.parse(output).records).toEqual([]);
    await expect(recallRoomMessages(client, ' ', ['run-1'])).rejects.toThrow(
      'Provide a search query of 1–500 characters.',
    );
    await expect(recallRoomMessages(client, 'x'.repeat(501), ['run-1'])).rejects.toThrow(
      'Provide a search query of 1–500 characters.',
    );
    expect(client.searchMessages).not.toHaveBeenCalled();
  });

  it('limits the provider query and returns attributed quotes only from allowed runs', async () => {
    const client = {
      searchMessages: vi
        .fn<HonchoClient['searchMessages']>()
        .mockResolvedValue([
          { ...message, session_id: 'other-run', content: 'unrelated secret' },
          { ...message, peer_id: null },
          message,
          { ...message, id: 'm-8', peer_id: 'fable', content: 'a'.repeat(900) },
        ]),
    };
    const output = await recallRoomMessages(client, '  release decision  ', ['run-1', 'run-1']);
    expect(client.searchMessages).toHaveBeenCalledWith('release decision', ['run-1'], 5);
    expect(JSON.parse(output).records).toEqual([
      {
        runId: 'run-1',
        messageId: 'm-7',
        author: 'sid',
        createdAt: message.created_at,
        quote: message.content,
        truncated: false,
      },
      expect.objectContaining({ author: 'fable', quote: 'a'.repeat(800), truncated: true }),
    ]);
    expect(output).not.toContain('unrelated secret');
  });

  it('caps the number of records even if the provider ignores the requested limit', async () => {
    const client = {
      searchMessages: vi
        .fn<HonchoClient['searchMessages']>()
        .mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ ...message, id: String(i) }))),
    };
    expect(JSON.parse(await recallRoomMessages(client, 'fix', ['run-1'])).records).toHaveLength(5);
  });
});
