import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MaestroSession, MaestroTurn, PartialRevision } from './maestro.types.js';
import type { TurnStatus } from '../chat/chat.types.js';

type Row = Record<string, SQLOutputValue>;
function status(value: unknown): TurnStatus {
  if (value === 'streaming' || value === 'completed' || value === 'stopped' || value === 'failed')
    return value;
  throw new Error('Stored Maestro turn status is invalid.');
}
function partialRevisions(value: unknown): PartialRevision[] {
  if (!Array.isArray(value)) throw new Error('Stored partial revisions are invalid.');
  return value.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('seat' in entry) ||
      (entry.seat !== 'a' && entry.seat !== 'b') ||
      !('turnId' in entry) ||
      typeof entry.turnId !== 'string' ||
      !('revision' in entry) ||
      typeof entry.revision !== 'number' ||
      !('text' in entry) ||
      typeof entry.text !== 'string' ||
      !('characters' in entry) ||
      typeof entry.characters !== 'number' ||
      !('truncated' in entry) ||
      typeof entry.truncated !== 'boolean'
    )
      throw new Error('Stored partial revision is invalid.');
    return {
      seat: entry.seat,
      turnId: entry.turnId,
      revision: entry.revision,
      text: entry.text,
      characters: entry.characters,
      truncated: entry.truncated,
    };
  });
}
function turn(row: Row): MaestroTurn {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    requestId: String(row.request_id),
    prompt: String(row.prompt),
    text: String(row.text),
    status: status(row.status),
    ...(row.error ? { error: String(row.error) } : {}),
    throughSeq: Number(row.through_seq),
    partialRevisions: partialRevisions(JSON.parse(String(row.partial_revisions))),
    fingerprint: String(row.fingerprint),
  };
}
export interface MaestroTerminal {
  id: string;
  turnId: string;
  runId: string;
  status: Exclude<TurnStatus, 'streaming'>;
  finishedAt: number;
  elapsedMs: number | null;
}
export class MaestroStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS maestro_turns(
        id TEXT PRIMARY KEY,run_id TEXT NOT NULL,request_id TEXT NOT NULL,prompt TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,error TEXT,through_seq INTEGER NOT NULL,
        partial_revisions TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL,
        UNIQUE(run_id,request_id)
      );
      CREATE TABLE IF NOT EXISTS maestro_cancelled_requests(
        run_id TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,
        PRIMARY KEY(run_id,request_id)
      );
      CREATE INDEX IF NOT EXISTS maestro_run_history ON maestro_turns(run_id,created_at);
      CREATE TABLE IF NOT EXISTS maestro_sessions(
        run_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,continuation TEXT NOT NULL,tool_version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS maestro_terminal_outbox(id TEXT PRIMARY KEY,turn_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,status TEXT NOT NULL,finished_at INTEGER NOT NULL,elapsed_ms REAL);
      CREATE TABLE IF NOT EXISTS maestro_criteria(run_id TEXT NOT NULL,turn_id TEXT PRIMARY KEY,request TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS maestro_feedback(run_id TEXT NOT NULL,event_id TEXT NOT NULL,turn_id TEXT NOT NULL UNIQUE,read INTEGER NOT NULL DEFAULT 0,question TEXT NOT NULL,PRIMARY KEY(run_id,event_id));
      UPDATE maestro_turns SET status='failed',error='The room restarted during this Maestro response. Send a new message to continue.' WHERE status='streaming';
    `);
  }
  find(runId: string, requestId: string): MaestroTurn | undefined {
    const row = this.db
      .prepare('SELECT * FROM maestro_turns WHERE run_id=? AND request_id=?')
      .get(runId, requestId);
    return row ? turn(row) : undefined;
  }
  findTurn(runId: string, turnId: string): MaestroTurn | undefined {
    const row = this.db
      .prepare('SELECT * FROM maestro_turns WHERE run_id=? AND id=?')
      .get(runId, turnId);
    return row ? turn(row) : undefined;
  }
  cancelRequest(runId: string, requestId: string) {
    this.db
      .prepare('INSERT OR IGNORE INTO maestro_cancelled_requests VALUES (?,?,?)')
      .run(runId, requestId, Date.now());
  }
  cancelled(runId: string, requestId: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM maestro_cancelled_requests WHERE run_id=? AND request_id=?')
        .get(runId, requestId),
    );
  }
  history(runId: string): MaestroTurn[] {
    return this.db
      .prepare('SELECT * FROM maestro_turns WHERE run_id=? ORDER BY created_at,rowid')
      .all(runId)
      .map(turn);
  }
  feedback(runId: string): {
    eventId: string;
    turnId: string;
    read: boolean;
    question: 'none' | 'unresolved' | 'resolved';
  }[] {
    return this.db
      .prepare('SELECT event_id,turn_id,read,question FROM maestro_feedback WHERE run_id=?')
      .all(runId)
      .map((row) => {
        if (row.question !== 'none' && row.question !== 'unresolved' && row.question !== 'resolved')
          throw new Error('Stored Maestro feedback state is invalid.');
        return {
          eventId: String(row.event_id),
          turnId: String(row.turn_id),
          read: row.read === 1,
          question: row.question,
        };
      });
  }
  markFeedback(runId: string, turnId: string, action: 'read' | 'resolve') {
    const query =
      action === 'read'
        ? 'UPDATE maestro_feedback SET read=1 WHERE run_id=? AND turn_id=?'
        : "UPDATE maestro_feedback SET question='resolved' WHERE run_id=? AND turn_id=? AND question='unresolved'";
    return this.db.prepare(query).run(runId, turnId).changes > 0;
  }
  create(
    value: Omit<MaestroTurn, 'text' | 'status' | 'error'>,
    feedback?: { eventId: string; question: boolean },
    criteria?: unknown,
  ) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          "INSERT INTO maestro_turns(id,run_id,request_id,prompt,status,through_seq,partial_revisions,fingerprint,created_at) VALUES (?,?,?,?,'streaming',?,?,?,?)",
        )
        .run(
          value.id,
          value.runId,
          value.requestId,
          value.prompt,
          value.throughSeq,
          JSON.stringify(value.partialRevisions),
          value.fingerprint,
          Date.now(),
        );
      if (feedback) {
        this.db
          .prepare(
            "UPDATE maestro_feedback SET event_id=event_id || '-attempt-' || turn_id WHERE run_id=? AND event_id=? AND turn_id IN (SELECT id FROM maestro_turns WHERE status IN ('failed','stopped'))",
          )
          .run(value.runId, feedback.eventId);
        this.db
          .prepare(
            'INSERT INTO maestro_feedback(run_id,event_id,turn_id,question) VALUES (?,?,?,?)',
          )
          .run(value.runId, feedback.eventId, value.id, feedback.question ? 'unresolved' : 'none');
      }
      if (criteria)
        this.db
          .prepare('INSERT INTO maestro_criteria(run_id,turn_id,request) VALUES (?,?,?)')
          .run(value.runId, value.id, JSON.stringify(criteria));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  criteria(runId: string, turnId: string): unknown {
    const row = this.db
      .prepare('SELECT request FROM maestro_criteria WHERE run_id=? AND turn_id=?')
      .get(runId, turnId);
    return row && typeof row.request === 'string' ? JSON.parse(row.request) : undefined;
  }
  append(id: string, text: string) {
    this.db
      .prepare("UPDATE maestro_turns SET text=text || ? WHERE id=? AND status='streaming'")
      .run(text, id);
  }
  finish(
    id: string,
    state: Exclude<TurnStatus, 'streaming'>,
    error?: string,
    timing?: { finishedAt: number; elapsedMs: number },
  ) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db
        .prepare("SELECT run_id FROM maestro_turns WHERE id=? AND status='streaming'")
        .get(id);
      if (row) {
        this.db
          .prepare("UPDATE maestro_turns SET status=?,error=? WHERE id=? AND status='streaming'")
          .run(state, error ?? null, id);
        if (state === 'completed')
          this.db
            .prepare(
              "UPDATE maestro_feedback SET question='unresolved' WHERE turn_id=? AND question='none' AND instr((SELECT text FROM maestro_turns WHERE id=?),'?')>0",
            )
            .run(id, id);
        this.db
          .prepare('INSERT INTO maestro_terminal_outbox VALUES (?,?,?,?,?,?)')
          .run(
            id,
            id,
            row.run_id!,
            state,
            timing?.finishedAt ?? Date.now(),
            timing?.elapsedMs ?? null,
          );
      }
      this.db.exec('COMMIT');
    } catch (failure) {
      this.db.exec('ROLLBACK');
      throw failure;
    }
  }
  pendingTerminals(): MaestroTerminal[] {
    return this.db
      .prepare('SELECT * FROM maestro_terminal_outbox ORDER BY finished_at,id')
      .all()
      .map((row) => {
        const terminal = status(row.status);
        if (terminal === 'streaming') throw new Error('Invalid Maestro terminal outbox entry.');
        return {
          id: String(row.id),
          turnId: String(row.turn_id),
          runId: String(row.run_id),
          status: terminal,
          finishedAt: Number(row.finished_at),
          elapsedMs: row.elapsed_ms === null ? null : Number(row.elapsed_ms),
        };
      });
  }
  acknowledgeTerminal(id: string) {
    this.db.prepare('DELETE FROM maestro_terminal_outbox WHERE id=?').run(id);
  }
  session(runId: string, fingerprint: string): MaestroSession | undefined {
    const row = this.db
      .prepare(
        'SELECT continuation,tool_version FROM maestro_sessions WHERE run_id=? AND fingerprint=?',
      )
      .get(runId, fingerprint);
    return row
      ? { continuation: String(row.continuation), toolVersion: Number(row.tool_version) }
      : undefined;
  }
  saveSession(turnId: string, continuation: string, toolVersion = 0) {
    const row = this.db
      .prepare("SELECT run_id,fingerprint FROM maestro_turns WHERE id=? AND status='streaming'")
      .get(turnId);
    if (!row) return;
    this.db
      .prepare(
        'INSERT INTO maestro_sessions VALUES (?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET fingerprint=excluded.fingerprint,continuation=excluded.continuation,tool_version=excluded.tool_version',
      )
      .run(String(row.run_id), String(row.fingerprint), continuation, toolVersion);
  }
  close() {
    this.db.close();
  }
}
