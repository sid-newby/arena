import { describe, expect, it, vi } from 'vitest';
import { HonchoClient } from '../../../src/memory/honcho-client.js';

describe('Honcho transport', () => {
  it('reconciles a lost append response after restart, preserving long text, author, and event time', async () => {
    const saved: {
      peer_id: string;
      content: string;
      metadata: { arena_event_id: string; arena_part: number };
      created_at: string;
    }[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, options) => {
      const path = new URL(String(input)).pathname;
      expect(options?.redirect).toBe('error');
      expect(options?.headers).toMatchObject({ Authorization: 'Bearer unit-test' });
      const body = JSON.parse(String(options?.body));
      if (path.endsWith('/list')) return Response.json({ items: saved });
      if (path.endsWith('/messages')) {
        saved.push(...body.messages);
        throw new TypeError('response lost');
      }
      return Response.json({});
    });
    const reply = {
      id: 'event:1',
      peerId: 'astra',
      content: 'a'.repeat(24_999) + '🗿z',
      createdAt: 500,
      metadata: { model: 'example-astra' },
    };
    const options = { apiKey: 'unit-test', fetch: fetcher };
    await expect(new HonchoClient(options).append('run-1', [reply])).rejects.toThrow(
      'response lost',
    );
    await new HonchoClient(options).append('run-1', [reply]);
    const filters = fetcher.mock.calls
      .filter(([input]) => new URL(String(input)).pathname.endsWith('/list'))
      .map(([, init]) => JSON.parse(String(init?.body)).filters.OR);
    const expectedParts = [0, 1].map((arena_part) => ({
      metadata: { arena_event_id: 'event:1', arena_part },
    }));
    expect(filters).toEqual([expectedParts, expectedParts]);
    expect(saved).toHaveLength(2);
    expect(saved.map((m) => m.content).join('')).toBe(reply.content);
    expect(saved[0]).toMatchObject({
      peer_id: 'astra',
      created_at: '1970-01-01T00:00:00.500Z',
      metadata: { model: 'example-astra', arena_parts: 2 },
    });
    expect(
      fetcher.mock.calls.filter(([input]) => String(input).endsWith('/messages')),
    ).toHaveLength(1);
  });

  it('returns an empty history on a new workspace and surfaces other search errors', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const client = new HonchoClient({ apiKey: 'test', fetch: fetcher });
    await expect(client.searchMessages('hello', ['hangout'], 5)).resolves.toEqual([]);
    await expect(client.searchMessages('hello', ['hangout'], 5)).rejects.toThrow('HTTP 403');
  });

  it('skips an empty recall allowlist and sends only authorized session IDs for scoped search', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const client = new HonchoClient({ apiKey: 'unit-test', fetch: fetcher });
    expect(await client.searchMessages('example', [], 3)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    await client.searchMessages('example', ['run-a', 'run-b'], 3);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'example',
      filters: { session_id: { in: ['run-a', 'run-b'] } },
      limit: 3,
    });
  });

  it('provisions, writes, and searches only its configured workspace', async () => {
    const fetcher = vi.fn<typeof fetch>(async (path, init) => {
      const url = new URL(String(path));
      if (url.pathname.endsWith('/list')) return Response.json({ items: [] });
      if (url.pathname.endsWith('/messages'))
        return Response.json(JSON.parse(String(init?.body)).messages);
      return Response.json([]);
    });
    const client = new HonchoClient({
      workspace: 'isolated-test',
      apiKey: 'unit-test',
      fetch: fetcher,
    });
    await client.append('run-1', [{ id: 'one', peerId: 'sample', content: 'test', createdAt: 0 }]);
    await client.searchMessages('test', ['run-1'], 1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ id: 'isolated-test' });
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/v3/workspaces',
      '/v3/workspaces/isolated-test/sessions',
      '/v3/workspaces/isolated-test/sessions/run-1/messages/list',
      '/v3/workspaces/isolated-test/sessions/run-1/messages',
      '/v3/workspaces/isolated-test/search',
    ]);
    expect(() => new HonchoClient({ workspace: '../arena-room' })).toThrow(
      'Invalid Honcho workspace',
    );
  });

  it('refreshes a rejected key without reporting provider response bodies or gcloud diagnostics', async () => {
    const loadKey = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('credential material'))
      .mockResolvedValueOnce('old-key')
      .mockResolvedValueOnce('new-key');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('credential material', { status: 401 }))
      .mockResolvedValueOnce(Response.json([]));
    const client = new HonchoClient({ loadKey, fetch: fetcher });
    await expect(client.searchMessages('q', ['r'], 1)).rejects.toThrow(
      'Honcho credential unavailable.',
    );
    await expect(client.searchMessages('q', ['r'], 1)).rejects.toThrow(
      'Honcho request failed (HTTP 401).',
    );
    expect(await client.searchMessages('q', ['r'], 1)).toEqual([]);
    expect(loadKey).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer new-key',
    });
  });
});
