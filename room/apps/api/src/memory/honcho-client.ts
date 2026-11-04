import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

export interface HonchoMessage {
  id: string;
  peerId: string;
  content: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

interface HonchoOptions {
  workspace?: string;
  apiKey?: string;
  gcpProject?: string;
  fetch?: typeof fetch;
  loadKey?: () => Promise<string>;
}

const endpoint = 'https://api.honcho.dev/v3/workspaces';
const exec = promisify(execFile);
const maxChars = 25_000;
const batchSize = 100;
const receipt = z.object({
  metadata: z.object({ arena_event_id: z.string(), arena_part: z.number().int() }),
});
const page = z.object({ items: z.array(receipt) });

async function secretManagerKey(project: string | undefined): Promise<string> {
  if (!project?.trim()) throw new Error('Honcho secret project is not configured.');
  const { stdout } = await exec(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      'latest',
      '--secret=HONCHO_API_KEY',
      `--project=${project.trim()}`,
      '--quiet',
    ],
    {
      timeout: 15_000,
      maxBuffer: 16_384,
      env: {
        ...process.env,
        CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true',
        CLOUDSDK_CORE_DISABLE_USAGE_REPORTING: 'true',
      },
    },
  );
  return stdout.trim();
}

function toWire(message: HonchoMessage) {
  // Split by Unicode code point so a long reply stays intact, including emoji.
  const chars = Array.from(message.content);
  const parts = Math.max(1, Math.ceil(chars.length / maxChars));
  return Array.from({ length: parts }, (_, part) => ({
    peer_id: message.peerId,
    content:
      parts === 1 ? message.content : chars.slice(part * maxChars, (part + 1) * maxChars).join(''),
    created_at: new Date(message.createdAt).toISOString(),
    metadata: {
      ...message.metadata,
      arena_event_id: message.id,
      arena_part: part,
      arena_parts: parts,
    },
  }));
}

export class HonchoClient {
  private readonly workspace: string;
  private readonly fetcher: typeof fetch;
  private readonly loadKey: () => Promise<string>;
  private key?: Promise<string>;
  private readonly sessions = new Set<string>();

  constructor(options: HonchoOptions = {}) {
    this.workspace = options.workspace ?? 'arena-room';
    if (!/^[a-zA-Z0-9_-]{1,512}$/.test(this.workspace))
      throw new Error('Invalid Honcho workspace name.');
    this.fetcher = options.fetch ?? fetch;
    const fixedKey = options.apiKey;
    this.loadKey =
      options.loadKey ??
      (fixedKey ? async () => fixedKey : () => secretManagerKey(options.gcpProject));
  }

  private async post(path: string, body: unknown, emptyOnMissing = false): Promise<unknown> {
    this.key ??= this.loadKey()
      .then((key) => {
        if (!key.trim()) throw new Error();
        return key.trim();
      })
      .catch(() => {
        this.key = undefined;
        // The gcloud error may include stdout or stderr. Never expose it.
        throw new Error('Honcho credential unavailable.');
      });
    const key = await this.key;
    const response = await this.fetcher(endpoint + path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) this.key = undefined;
      await response.body?.cancel();
      if (emptyOnMissing && response.status === 404) return [];
      throw new Error(`Honcho request failed (HTTP ${response.status}).`);
    }
    return response.json();
  }

  async searchMessages(query: string, runIds: readonly string[], limit: number): Promise<unknown> {
    if (!runIds.length) return [];
    return this.post(
      `/${this.workspace}/search`,
      {
        query,
        filters: { session_id: { in: runIds } },
        limit,
      },
      true,
    );
  }

  async append(runId: string, messages: HonchoMessage[]): Promise<void> {
    if (!messages.length) return;
    if (!this.sessions.has(runId)) {
      await this.post('', { id: this.workspace });
      await this.post(`/${this.workspace}/sessions`, { id: runId });
      this.sessions.add(runId);
    }
    const path = `/${this.workspace}/sessions/${encodeURIComponent(runId)}/messages`;
    const parts = messages.flatMap(toWire);
    for (let i = 0; i < parts.length; i += batchSize) {
      const batch = parts.slice(i, i + batchSize);
      // Honcho assigns its own message IDs. Recover a lost acknowledgement by
      // consulting our event/part metadata before issuing any new writes.
      const filters = batch.map(({ metadata: { arena_event_id, arena_part } }) => ({
        metadata: { arena_event_id, arena_part },
      }));
      const found = page.parse(
        await this.post(`${path}/list?size=${batchSize}`, { filters: { OR: filters } }),
      );
      const ids = new Set(
        found.items.map(({ metadata }) =>
          JSON.stringify([metadata.arena_event_id, metadata.arena_part]),
        ),
      );
      const missing = batch.filter(({ metadata }) => {
        const key = JSON.stringify([metadata.arena_event_id, metadata.arena_part]);
        if (ids.has(key)) return false;
        ids.add(key);
        return true;
      });
      if (missing.length) {
        const saved = z.array(receipt).parse(await this.post(path, { messages: missing }));
        if (saved.length !== missing.length)
          throw new Error('Incomplete Honcho message acknowledgement.');
      }
    }
  }
}
