import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { modelName } from '../runs/participant-name.js';
import { recallRoomMessages } from './honcho-recall.js';
import type { Correspondence, ParticipantBinding } from '../runs/run.contract.js';
import type { HonchoClient, HonchoMessage } from './honcho-client.js';

export const HANGOUT_ID = 'hangout';
export const recallTool = {
  name: 'recall_room',
  description:
    'Search earlier public messages from this hangout when remembering something would help. Results include the speaker, time, and original wording.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', minLength: 1, maxLength: 500 } },
    required: ['query'],
    additionalProperties: false,
  },
};

function capture(event: Correspondence): HonchoMessage | undefined {
  const { payload, kind, role, seq, createdAt } = event;
  if (event.runId !== HANGOUT_ID || typeof payload.text !== 'string' || !payload.text.trim())
    return;
  let peerId: string;
  let id = kind + '-' + (event.turnId ?? payload.messageId ?? seq);
  const metadata: Record<string, unknown> = { correspondence_seq: seq };
  if (kind === 'message.queued' || (kind === 'human.prompt' && payload.trigger === 'human')) {
    peerId = 'sid';
    metadata.recipient_seat = payload.seat ?? role;
    if (kind === 'message.queued' && typeof payload.broadcastId === 'string') {
      id =
        'both-' +
        createHash('sha256')
          .update(JSON.stringify([payload.broadcastId, payload.text]))
          .digest('hex');
      metadata.recipient_seat = 'both';
    }
  } else if (
    kind === 'turn.finished' &&
    payload.status === 'completed' &&
    (role === 'a' || role === 'b') &&
    typeof payload.model === 'string'
  ) {
    peerId = modelName(payload.model).toLowerCase();
    Object.assign(metadata, {
      seat: role,
      model: payload.model,
      provider: payload.provider,
      turn_id: event.turnId,
      addressed_to: payload.addressedTo ?? 'sid',
    });
  } else return;
  return { id, peerId, createdAt, content: payload.text, metadata };
}

type Client = Pick<HonchoClient, 'append' | 'searchMessages'>;
export type PrivateClientFactory = (channel: string) => Client;

export class RoomMemory {
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private closed = false;
  private retryMs = 1000;
  private failed = false;
  private readonly privateClients = new Map<string, Client>();
  constructor(
    private readonly db: DatabaseSync,
    readonly client: Client,
    private readonly privateFactory?: PrivateClientFactory,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS honcho_delivery (
      seq INTEGER PRIMARY KEY, message_id TEXT NOT NULL UNIQUE, channel TEXT NOT NULL,
      message TEXT
    ); CREATE INDEX IF NOT EXISTS honcho_delivery_pending ON honcho_delivery(seq) WHERE message IS NOT NULL;`);
  }
  get whispersEnabled() {
    return Boolean(this.privateFactory);
  }
  private privateClient(channel: string) {
    let client = this.privateClients.get(channel);
    if (!client) {
      if (!this.privateFactory) throw new Error('Whisper memory is off.');
      client = this.privateFactory(channel);
      this.privateClients.set(channel, client);
    }
    return client;
  }
  recallWhisper(binding: ParticipantBinding, query: string) {
    return recallRoomMessages(
      this.privateClient(modelName(binding.config.model).toLowerCase()),
      query,
      [HANGOUT_ID],
    );
  }

  private pairAudience(speaker: ParticipantBinding, other: ParticipantBinding) {
    if (
      speaker.runId !== HANGOUT_ID ||
      other.runId !== HANGOUT_ID ||
      speaker.role === 'maestro' ||
      other.role === 'maestro' ||
      speaker.role === other.role
    )
      throw new Error('Peer whispers require both hangout participants.');
    return [speaker, other]
      .map((binding) => modelName(binding.config.model).toLowerCase())
      .toSorted((a, b) => a.localeCompare(b));
  }
  recallPeerWhisper(speaker: ParticipantBinding, other: ParticipantBinding, query: string) {
    const audience = this.pairAudience(speaker, other);
    return recallRoomMessages(this.privateClient('pair-' + audience.join('-')), query, [
      HANGOUT_ID,
    ]);
  }
  recordPeerWhisper(
    id: string,
    speaker: ParticipantBinding,
    other: ParticipantBinding,
    content: string,
    createdAt: number,
  ) {
    if (!this.privateFactory) return;
    const peerId = modelName(speaker.config.model).toLowerCase();
    const pair = this.pairAudience(speaker, other);
    this.enqueue('pair-' + pair.join('-'), {
      id: 'peer-' + id,
      peerId,
      content,
      createdAt,
      metadata: { audience: pair },
    });
  }
  record(event: Correspondence) {
    if (event.runId !== HANGOUT_ID) return;
    if (
      this.privateFactory &&
      (event.kind === 'side.message.queued' || event.kind === 'side.message.completed')
    ) {
      const row = this.db
        .prepare(`SELECT m.prompt,m.text,b.config FROM side_messages m
        JOIN participant_bindings b ON b.id=m.binding_id WHERE m.id=? AND b.run_id=?`)
        .get(String(event.payload.turnId), event.runId);
      if (!row) return;
      const participant = modelName(JSON.parse(String(row.config)).model).toLowerCase();
      const human = event.kind === 'side.message.queued';
      const content = String(human ? row.prompt : row.text);
      if (content.trim())
        this.enqueue(participant, {
          id: event.kind + '-' + String(event.payload.turnId),
          peerId: human ? 'sid' : participant,
          content,
          createdAt: event.createdAt,
          metadata: { audience: ['sid', participant] },
        });
      return;
    }
    const message = capture(event);
    if (message) this.enqueue('room', message);
  }
  private enqueue(channel: string, message: HonchoMessage) {
    this.db
      .prepare('INSERT OR IGNORE INTO honcho_delivery(message_id,channel,message) VALUES (?,?,?)')
      .run(message.id, channel, JSON.stringify(message));
    this.wake();
  }
  status() {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total, COUNT(message) AS pending FROM honcho_delivery')
      .get()!;
    return {
      enabled: true,
      workspace: 'arena-room',
      session: HANGOUT_ID,
      pending: Number(row.pending),
      sent: Number(row.total) - Number(row.pending),
      retrying: this.failed,
    };
  }
  wake() {
    if (
      this.closed ||
      this.timer ||
      this.running ||
      !this.db.prepare('SELECT 1 FROM honcho_delivery WHERE message IS NOT NULL LIMIT 1').get()
    )
      return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.running = this.drain().finally(() => {
          this.running = undefined;
          this.wake();
        });
      },
      this.failed ? this.retryMs : 150,
    );
    this.timer.unref();
  }
  private async drain() {
    try {
      while (!this.closed) {
        const first = this.db
          .prepare(
            'SELECT channel FROM honcho_delivery WHERE message IS NOT NULL ORDER BY seq LIMIT 1',
          )
          .get();
        if (!first) return;
        const channel = String(first.channel);
        const rows = this.db
          .prepare(
            'SELECT seq,message FROM honcho_delivery WHERE channel=? AND message IS NOT NULL ORDER BY seq LIMIT 32',
          )
          .all(channel);
        const client = channel === 'room' ? this.client : this.privateClient(channel);
        await client.append(
          HANGOUT_ID,
          rows.map((row) => JSON.parse(String(row.message)) as HonchoMessage),
        );
        this.db
          .prepare(
            'UPDATE honcho_delivery SET message=NULL WHERE channel=? AND seq<=? AND message IS NOT NULL',
          )
          .run(channel, rows.at(-1)!.seq);
        this.failed = false;
        this.retryMs = 1000;
      }
    } catch {
      this.failed = true;
      this.retryMs = Math.min(this.retryMs * 2, 60_000);
    }
  }
  async close() {
    this.closed = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
