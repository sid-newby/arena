import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { ConflictException } from '@nestjs/common';
import type { HangoutPresence } from './hangout-presence.js';
import type { SideMessage } from './side-conversation.contract.js';
import type { ParticipantBinding } from '../runs/run.contract.js';

type Row = Record<string, SQLOutputValue>;
const message = (row: Row): SideMessage => {
  const status = row.status;
  if (
    status !== 'queued' &&
    status !== 'streaming' &&
    status !== 'completed' &&
    status !== 'stopped' &&
    status !== 'failed'
  )
    throw new Error('Invalid side message.');
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    prompt: String(row.prompt),
    text: String(row.text),
    status,
    ...(row.error ? { error: String(row.error) } : {}),
  };
};
export class SideConversationStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly transaction: <T>(action: () => T) => T,
    private readonly presence: HangoutPresence,
    private readonly event: (runId: string, kind: string, payload: Record<string, unknown>) => void,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS side_sessions(binding_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,seat TEXT NOT NULL,checkpoint TEXT NOT NULL,continuation TEXT,tool_version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS side_messages(id TEXT PRIMARY KEY,binding_id TEXT NOT NULL,request_id TEXT NOT NULL,revision INTEGER NOT NULL,prompt TEXT NOT NULL,text TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,error TEXT,created_at INTEGER NOT NULL,UNIQUE(binding_id,request_id));`);
    if (
      !db
        .prepare('PRAGMA table_info(side_sessions)')
        .all()
        .some((row) => row.name === 'recall_enabled')
    )
      db.exec('ALTER TABLE side_sessions ADD COLUMN recall_enabled INTEGER NOT NULL DEFAULT 0');
    db.prepare(
      "UPDATE side_sessions SET continuation=NULL,tool_version=0 WHERE binding_id IN (SELECT binding_id FROM side_messages WHERE status='streaming')",
    ).run();
    db.prepare(
      "UPDATE side_messages SET status='failed',error='The server restarted with a side reply in flight. Review the conversation and resend explicitly.' WHERE status='queued' AND binding_id IN (SELECT binding_id FROM side_messages WHERE status='streaming')",
    ).run();
    db.prepare(
      "UPDATE side_messages SET status='failed',error='The server restarted. This side reply was not replayed.' WHERE status='streaming'",
    ).run();
  }
  session(binding: ParticipantBinding, checkpoint: string) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO side_sessions(binding_id,run_id,seat,checkpoint) VALUES (?,?,?,?)',
      )
      .run(binding.id, binding.runId, binding.role, checkpoint);
    return this.db.prepare('SELECT * FROM side_sessions WHERE binding_id=?').get(binding.id)!;
  }
  list(bindingId: string) {
    return this.db
      .prepare(
        "SELECT * FROM side_messages WHERE binding_id=? AND (status IN ('queued','streaming') OR id IN (SELECT id FROM side_messages WHERE binding_id=? ORDER BY rowid DESC LIMIT 100)) ORDER BY rowid",
      )
      .all(bindingId, bindingId)
      .map(message);
  }
  enqueue(binding: ParticipantBinding, revision: number, requestId: string, prompt: string) {
    return this.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM side_messages WHERE binding_id=? AND request_id=?')
        .get(binding.id, requestId);
      if (existing) {
        if (existing.prompt !== prompt || Number(existing.revision) !== revision)
          throw new ConflictException(
            'This side request ID belongs to different content or revision.',
          );
        return String(existing.id);
      }
      if (!this.presence.isPresent(binding))
        throw new ConflictException('This participant is away from the hangout.');
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO side_messages(id,binding_id,request_id,revision,prompt,status,created_at) VALUES (?,?,?,?,?,'queued',?)",
        )
        .run(id, binding.id, requestId, revision, prompt, Date.now());
      this.event(binding.runId, 'side.message.queued', { seat: binding.role, turnId: id });
      return id;
    });
  }
  saveSession(bindingId: string, continuation: string, toolVersion = 0, recallEnabled = false) {
    this.db
      .prepare(
        'UPDATE side_sessions SET continuation=?,tool_version=?,recall_enabled=? WHERE binding_id=?',
      )
      .run(continuation, toolVersion, Number(recallEnabled), bindingId);
  }
  resetSession(bindingId: string) {
    this.db
      .prepare('UPDATE side_sessions SET continuation=NULL,tool_version=0 WHERE binding_id=?')
      .run(bindingId);
  }
  update(binding: ParticipantBinding, id: string, status: SideMessage['status'], error?: string) {
    this.transaction(() => {
      this.db
        .prepare('UPDATE side_messages SET status=?,error=? WHERE id=? AND binding_id=?')
        .run(status, error ?? null, id, binding.id);
      this.event(binding.runId, 'side.message.' + status, { seat: binding.role, turnId: id });
    });
  }
  append(id: string, text: string) {
    this.db
      .prepare("UPDATE side_messages SET text=text || ? WHERE id=? AND status='streaming'")
      .run(text, id);
  }
  busy(runId: string) {
    return (
      Number(
        this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM side_messages m JOIN side_sessions s ON s.binding_id=m.binding_id WHERE s.run_id=? AND m.status IN ('queued','streaming')",
          )
          .get(runId)?.n,
      ) > 0
    );
  }
  cancelRun(runId: string) {
    this.db
      .prepare(
        "UPDATE side_messages SET status='stopped' WHERE status='queued' AND binding_id IN (SELECT binding_id FROM side_sessions WHERE run_id=?)",
      )
      .run(runId);
  }
  cancelQueued(binding: ParticipantBinding) {
    this.transaction(() => {
      this.db
        .prepare("UPDATE side_messages SET status='stopped' WHERE binding_id=? AND status='queued'")
        .run(binding.id);
      this.event(binding.runId, 'side.queue.cancelled', { seat: binding.role });
    });
  }
}
