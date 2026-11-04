import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { MessageIntent, MessageReceipt, MessageStatus } from './message.contract.js';
import { MESSAGE_INTENTS, MESSAGE_STATUSES } from './message.contract.js';
import type { SeatId } from '../runs/run.contract.js';

type Row = Record<string, SQLOutputValue>;
const receipt = (row: Row): MessageReceipt => {
  if (
    (row.seat !== 'a' && row.seat !== 'b') ||
    !MESSAGE_INTENTS.some((v) => v === row.intent) ||
    !MESSAGE_STATUSES.some((v) => v === row.status)
  )
    throw new Error('Invalid saved message.');
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    runId: String(row.run_id),
    seat: row.seat,
    bindingId: String(row.binding_id),
    revision: Number(row.revision),
    intent: row.intent as MessageIntent,
    text: String(row.text),
    status: row.status as MessageStatus,
    createdAt: Number(row.created_at),
    ...(row.turn_id ? { turnId: String(row.turn_id) } : {}),
    ...(row.error ? { error: String(row.error) } : {}),
  };
};
export class SeatMessageStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly transaction: <T>(action: () => T) => T,
    private readonly event: (runId: string, kind: string, payload: Record<string, unknown>) => void,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS human_messages(id TEXT PRIMARY KEY,request_id TEXT NOT NULL,run_id TEXT NOT NULL,seat TEXT NOT NULL,binding_id TEXT NOT NULL,revision INTEGER NOT NULL,intent TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,turn_id TEXT,error TEXT,created_at INTEGER NOT NULL,UNIQUE(run_id,seat,request_id));
      CREATE INDEX IF NOT EXISTS human_message_queue ON human_messages(run_id,seat,status,created_at);`);
    if (
      !db
        .prepare('PRAGMA table_info(human_messages)')
        .all()
        .some((row) => row.name === 'dispatch_revision')
    ) {
      db.exec('ALTER TABLE human_messages ADD COLUMN dispatch_revision INTEGER');
      db.prepare('UPDATE human_messages SET dispatch_revision=revision').run();
    }
    this.transaction(() => {
      for (const row of db
        .prepare("SELECT id,run_id FROM human_messages WHERE status IN ('dispatching','running')")
        .all()) {
        db.prepare("UPDATE human_messages SET status='uncertain',error=? WHERE id=?").run(
          'The server restarted after dispatch. This message was not replayed.',
          row.id,
        );
        this.event(String(row.run_id), 'message.uncertain', { messageId: String(row.id) });
      }
    });
  }
  list(runId: string, seat: SeatId) {
    return this.db
      .prepare(
        "SELECT * FROM human_messages WHERE run_id=? AND seat=? AND (status IN ('queued','dispatching','running') OR id IN (SELECT id FROM human_messages WHERE run_id=? AND seat=? ORDER BY rowid DESC LIMIT 100)) ORDER BY created_at,rowid",
      )
      .all(runId, seat, runId, seat)
      .map(receipt);
  }
  find(runId: string, seat: SeatId, requestId: string) {
    const row = this.db
      .prepare('SELECT * FROM human_messages WHERE run_id=? AND seat=? AND request_id=?')
      .get(runId, seat, requestId);
    return row ? receipt(row) : undefined;
  }
  get(id: string, runId: string, seat: SeatId) {
    const row = this.db
      .prepare('SELECT * FROM human_messages WHERE id=? AND run_id=? AND seat=?')
      .get(id, runId, seat);
    if (!row) throw new NotFoundException('Unknown seat message.');
    return receipt(row);
  }
  create(input: Omit<MessageReceipt, 'id' | 'status' | 'createdAt'>, broadcastId?: string) {
    return this.transaction(() => {
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO human_messages(id,request_id,run_id,seat,binding_id,revision,intent,text,status,created_at) VALUES (?,?,?,?,?,?,?,?,'queued',?)",
        )
        .run(
          id,
          input.requestId,
          input.runId,
          input.seat,
          input.bindingId,
          input.revision,
          input.intent,
          input.text,
          Date.now(),
        );
      this.db
        .prepare('UPDATE human_messages SET dispatch_revision=? WHERE id=?')
        .run(input.revision, id);
      this.event(input.runId, 'message.queued', {
        messageId: id,
        requestId: input.requestId,
        ...(broadcastId ? { broadcastId } : {}),
        seat: input.seat,
        intent: input.intent,
        text: input.text,
      });
      return this.get(id, input.runId, input.seat);
    });
  }
  update(
    message: MessageReceipt,
    status: MessageStatus,
    options: { turnId?: string; error?: string } = {},
  ) {
    this.transaction(() => {
      this.db
        .prepare(
          'UPDATE human_messages SET status=?,turn_id=COALESCE(?,turn_id),error=? WHERE id=?',
        )
        .run(status, options.turnId ?? null, options.error ?? null, message.id);
      this.event(message.runId, 'message.' + status, {
        messageId: message.id,
        seat: message.seat,
        ...(options.turnId ? { turnId: options.turnId } : {}),
        ...(options.error ? { error: options.error } : {}),
      });
    });
  }
  pending(runId: string, seat?: SeatId) {
    const sql =
      "SELECT 1 FROM human_messages WHERE run_id=? AND status IN ('queued','dispatching','running')";
    return Boolean(
      seat
        ? this.db.prepare(sql + ' AND seat=? LIMIT 1').get(runId, seat)
        : this.db.prepare(sql + ' LIMIT 1').get(runId),
    );
  }
  next(runId: string, seat: SeatId) {
    const row = this.db
      .prepare(
        "SELECT * FROM human_messages WHERE run_id=? AND seat=? AND status='queued' ORDER BY (intent='interrupt') DESC,created_at,rowid LIMIT 1",
      )
      .get(runId, seat);
    return row ? receipt(row) : undefined;
  }
  dispatchRevision(id: string) {
    return Number(
      this.db.prepare('SELECT dispatch_revision FROM human_messages WHERE id=?').get(id)
        ?.dispatch_revision,
    );
  }
  reapprove(runId: string, seat: SeatId, bindingId: string, revision: number) {
    this.transaction(() => {
      for (const message of this.list(runId, seat)) {
        if (message.status !== 'queued' || message.bindingId !== bindingId) continue;
        this.db
          .prepare('UPDATE human_messages SET dispatch_revision=? WHERE id=?')
          .run(revision, message.id);
        this.event(runId, 'message.reapproved', { messageId: message.id, bindingId, revision });
      }
    });
  }
  cancel(id: string, runId: string, seat: SeatId) {
    const message = this.get(id, runId, seat);
    if (message.status === 'cancelled') return message;
    if (message.status !== 'queued' && message.status !== 'uncertain')
      throw new ConflictException(
        'Only queued or unconfirmed messages can be cancelled. Use Stop for an active reply.',
      );
    this.update(message, 'cancelled');
    return this.get(id, runId, seat);
  }
  cancelPending(runId: string, seat?: SeatId) {
    for (const target of seat ? [seat] : (['a', 'b'] as const))
      for (const message of this.list(runId, target))
        if (message.status === 'queued' || message.status === 'dispatching')
          this.update(message, 'cancelled');
  }
  finish(turnId: string, status: 'completed' | 'stopped' | 'failed', error?: string) {
    // A turn can carry its opening message plus follow-ups delivered while it ran.
    for (const row of this.db
      .prepare('SELECT * FROM human_messages WHERE turn_id=? ORDER BY rowid')
      .all(turnId))
      if (row.status === 'running' || row.status === 'dispatching')
        this.update(receipt(row), status, { error });
  }
}
