import { parseProviderConfig } from '../runs/provider-config.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  ActionProposal,
  RunSnapshot,
  SeatId,
  TaskDraft,
  WorkflowPhase,
} from '../runs/run.contract.js';

type Transaction = <T>(action: () => T) => T;
export type WorkflowStage = 'independent' | 'comparison' | 'discussion';
export interface WorkflowRecord {
  phase: WorkflowPhase;
  task: TaskDraft | null;
  startedAt: number | null;
  stage: WorkflowStage | null;
  turns: Record<SeatId, string | null>;
  deadline: number | null;
  pauseRequested: boolean;
  handoffs: number;
  error?: string;
  proposedSeats?: Record<SeatId, import('../runs/run.contract.js').ProviderConfig>;
}
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function parseTask(value: unknown): TaskDraft {
  if (!object(value)) throw new BadRequestException('Provide a task draft.');
  const string = (name: string, limit: number, required = false) => {
    const text = value[name];
    if (typeof text !== 'string' || text.length > limit || (required && !text.trim()))
      throw new BadRequestException(`Provide valid ${name}.`);
    return text.trim();
  };
  const strings = (name: string, count: number, limit: number) => {
    const items = value[name];
    if (
      !Array.isArray(items) ||
      items.length > count ||
      !items.every((item: unknown) => typeof item === 'string' && item.length <= limit)
    )
      throw new BadRequestException(`Provide valid ${name}.`);
    return items.map((item: string) => item.trim()).filter(Boolean);
  };
  if (
    (value.mode !== 'reasoning' && value.mode !== 'prototype') ||
    (value.profile !== 'analysis' && value.profile !== 'build')
  )
    throw new BadRequestException('Choose a reasoning or prototype task and a tool profile.');
  if (value.mode === 'prototype' && value.profile !== 'build')
    throw new BadRequestException('Prototype tasks require the build profile.');
  if (
    !Number.isSafeInteger(value.maxHandoffs) ||
    typeof value.maxHandoffs !== 'number' ||
    value.maxHandoffs < 0 ||
    value.maxHandoffs > 8 ||
    !Number.isSafeInteger(value.timeLimitSeconds) ||
    typeof value.timeLimitSeconds !== 'number' ||
    value.timeLimitSeconds < 30 ||
    value.timeLimitSeconds > 3600
  )
    throw new BadRequestException(
      'Choose 0 to 8 handoffs and a time limit from 30 to 3600 seconds.',
    );
  let source: TaskDraft['source'] = null;
  if (value.source !== null) {
    if (
      !object(value.source) ||
      typeof value.source.repository !== 'string' ||
      !value.source.repository.trim() ||
      value.source.repository.length > 4096 ||
      typeof value.source.revision !== 'string' ||
      !/^(HEAD|[a-f0-9]{40,64})$/.test(value.source.revision)
    )
      throw new BadRequestException('Choose a repository path and HEAD or an immutable commit.');
    source = { repository: value.source.repository, revision: value.source.revision };
  }
  let scaffold: TaskDraft['scaffold'];
  if (value.scaffold !== undefined) {
    if (
      !object(value.scaffold) ||
      typeof value.scaffold.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.scaffold.id) ||
      (value.scaffold.digest !== undefined &&
        (typeof value.scaffold.digest !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.scaffold.digest))) ||
      source
    )
      throw new BadRequestException('Choose either a scaffold or a repository.');
    scaffold = {
      id: value.scaffold.id,
      ...(typeof value.scaffold.digest === 'string' ? { digest: value.scaffold.digest } : {}),
    };
  }
  if (
    value.projectDirectory !== undefined &&
    (typeof value.projectDirectory !== 'string' ||
      !value.projectDirectory.trim() ||
      value.projectDirectory.length > 4096)
  )
    throw new BadRequestException('Choose a valid project directory.');
  const task: TaskDraft = {
    question: string('question', 6000, true),
    mode: value.mode,
    expectedArtifact: string('expectedArtifact', 1000),
    criteria: strings('criteria', 8, 500),
    grounding: strings('grounding', 20, 1000),
    source,
    ...(typeof value.projectDirectory === 'string'
      ? { projectDirectory: value.projectDirectory.trim() }
      : {}),
    ...(scaffold ? { scaffold } : {}),
    profile: value.profile,
    maxHandoffs: value.maxHandoffs,
    timeLimitSeconds: value.timeLimitSeconds,
  };
  if (JSON.stringify(task).length > 10000)
    throw new BadRequestException('Keep the task and shared grounding within 10000 characters.');
  return task;
}
const emptyRecord = (): WorkflowRecord => ({
  phase: 'draft',
  task: null,
  startedAt: null,
  stage: null,
  turns: { a: null, b: null },
  deadline: null,
  pauseRequested: false,
  handoffs: 0,
});
const phases: WorkflowPhase[] = [
  'draft',
  'preparing',
  'ready',
  'independent',
  'awaiting-comparison',
  'comparison',
  'discussion',
  'paused',
  'completed',
  'stopped',
  'interrupted',
  'failed',
];
export class WorkflowStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly transaction: Transaction,
    private readonly run: (id: string) => RunSnapshot,
    private readonly append: (id: string, kind: string, payload: Record<string, unknown>) => void,
  ) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS run_workflows(run_id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workflow_commands(run_id TEXT NOT NULL,request_id TEXT NOT NULL,kind TEXT NOT NULL,input TEXT NOT NULL,PRIMARY KEY(run_id,request_id)); CREATE TABLE IF NOT EXISTS workflow_proposals(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS workflow_syntheses(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,body TEXT NOT NULL);`,
    );
    db.exec(
      `CREATE TABLE IF NOT EXISTS workflow_feedback_queue(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,kind TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,delivered INTEGER NOT NULL DEFAULT 0)`,
    );
    for (const row of db.prepare('SELECT run_id,body FROM run_workflows').all()) {
      const record = this.read(String(row.run_id));
      if (['preparing', 'independent', 'comparison', 'discussion'].includes(record.phase)) {
        this.write(String(row.run_id), {
          ...record,
          phase: 'interrupted',
          error:
            'The room restarted. Review the completed outputs and explicitly prepare or retry unfinished work.',
        });
      }
    }
  }
  read(id: string): WorkflowRecord {
    this.run(id);
    const row = this.db.prepare('SELECT body FROM run_workflows WHERE run_id=?').get(id);
    if (!row) return emptyRecord();
    const value: unknown = JSON.parse(String(row.body));
    if (!object(value) || !phases.some((phase) => phase === value.phase))
      throw new Error('Stored workflow is invalid.');
    const phase = phases.find((candidate) => candidate === value.phase);
    const stage = value.stage;
    if (
      !phase ||
      (stage !== null &&
        stage !== 'independent' &&
        stage !== 'comparison' &&
        stage !== 'discussion') ||
      !object(value.turns) ||
      !['a', 'b'].every(
        (seat) =>
          value.turns &&
          object(value.turns) &&
          (value.turns[seat] === null || typeof value.turns[seat] === 'string'),
      ) ||
      (value.startedAt !== null && typeof value.startedAt !== 'number') ||
      (value.deadline !== null && typeof value.deadline !== 'number') ||
      typeof value.pauseRequested !== 'boolean' ||
      typeof value.handoffs !== 'number' ||
      !Number.isSafeInteger(value.handoffs) ||
      (value.error !== undefined && typeof value.error !== 'string')
    )
      throw new Error('Stored workflow state is invalid.');
    const turns = value.turns;
    const a = turns.a,
      b = turns.b;
    if ((a !== null && typeof a !== 'string') || (b !== null && typeof b !== 'string'))
      throw new Error('Stored workflow turns are invalid.');
    const task = value.task === null ? null : parseTask(value.task);
    if (
      [
        'ready',
        'independent',
        'awaiting-comparison',
        'comparison',
        'discussion',
        'paused',
        'completed',
      ].includes(phase) &&
      !task
    )
      throw new Error('Stored workflow task is missing.');
    let proposedSeats: WorkflowRecord['proposedSeats'];
    if (value.proposedSeats !== undefined) {
      if (!object(value.proposedSeats)) throw new Error('Stored model proposal is invalid.');
      proposedSeats = {
        a: parseProviderConfig(value.proposedSeats.a),
        b: parseProviderConfig(value.proposedSeats.b),
      };
    }
    return {
      phase,
      task,
      startedAt: value.startedAt,
      stage,
      turns: { a, b },
      deadline: value.deadline,
      pauseRequested: value.pauseRequested,
      handoffs: value.handoffs,
      ...(value.error ? { error: value.error } : {}),
      ...(proposedSeats ? { proposedSeats } : {}),
    };
  }
  write(id: string, record: WorkflowRecord) {
    this.db
      .prepare(
        'INSERT INTO run_workflows VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET body=excluded.body',
      )
      .run(id, JSON.stringify(record));
  }
  update(id: string, change: Partial<WorkflowRecord>, event = 'workflow.changed') {
    return this.transaction(() => {
      const record = { ...this.read(id), ...change };
      this.write(id, record);
      const kind =
        event === 'workflow.independent-completed'
          ? 'results-ready'
          : event === 'workflow.candidate-failed' || event === 'workflow.prepare-failed'
            ? 'blocked'
            : null;
      if (kind)
        this.db
          .prepare('INSERT INTO workflow_feedback_queue(id,run_id,kind) VALUES(?,?,?)')
          .run(randomUUID(), id, kind);
      this.append(id, event, {
        phase: record.phase,
        stage: record.stage,
        ...(record.error ? { error: record.error } : {}),
      });
      return record;
    });
  }
  pendingFeedback(now: number) {
    return this.db
      .prepare(
        'SELECT id,run_id,kind,attempts FROM workflow_feedback_queue WHERE delivered=0 AND attempts<8 AND next_at<=? ORDER BY rowid LIMIT 10',
      )
      .all(now)
      .map((row) => ({
        id: String(row.id),
        runId: String(row.run_id),
        kind: String(row.kind) === 'blocked' ? ('blocked' as const) : ('results-ready' as const),
        attempts: Number(row.attempts),
      }));
  }
  finishFeedback(id: string, success: boolean, attempts: number, now: number) {
    if (success)
      this.db.prepare('UPDATE workflow_feedback_queue SET delivered=1 WHERE id=?').run(id);
    else
      this.db
        .prepare('UPDATE workflow_feedback_queue SET attempts=?,next_at=? WHERE id=?')
        .run(attempts + 1, now + Math.min(300000, 5000 * 2 ** attempts), id);
  }
  failedFeedbackCount(runId: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM workflow_feedback_queue WHERE run_id=? AND delivered=0 AND attempts>=8',
      )
      .get(runId);
    return Number(row?.count ?? 0);
  }
  retryFailedFeedback(runId: string): void {
    this.db
      .prepare(
        'UPDATE workflow_feedback_queue SET attempts=0,next_at=0 WHERE run_id=? AND delivered=0 AND attempts>=8',
      )
      .run(runId);
  }
  check(id: string, expected: number) {
    if (this.run(id).revision !== expected)
      throw new ConflictException('The run changed. Review its latest revision.');
  }
  claim(id: string, requestId: string, kind: string, input: unknown): boolean {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId))
      throw new BadRequestException('Provide a stable requestId.');
    const prior = this.db
      .prepare('SELECT kind,input FROM workflow_commands WHERE run_id=? AND request_id=?')
      .get(id, requestId);
    const serialized = JSON.stringify(input);
    if (prior) {
      if (prior.kind !== kind || prior.input !== serialized)
        throw new ConflictException('This requestId already names a different operation.');
      return false;
    }
    this.db
      .prepare('INSERT INTO workflow_commands VALUES (?,?,?,?)')
      .run(id, requestId, kind, serialized);
    return true;
  }
  claimed(id: string, requestId: string, kind: string, input?: unknown): boolean {
    const prior = this.db
      .prepare('SELECT kind,input FROM workflow_commands WHERE run_id=? AND request_id=?')
      .get(id, requestId);
    if (
      prior &&
      (prior.kind !== kind || (input !== undefined && prior.input !== JSON.stringify(input)))
    )
      throw new ConflictException('This requestId already names a different operation.');
    return Boolean(prior);
  }
  reserveHandoff(id: string, turnId: string) {
    this.transaction(() => {
      const record = this.read(id);
      if (!record.task) return;
      if (record.phase !== 'discussion' || record.pauseRequested)
        throw new ConflictException(
          'Peer delivery is unavailable until a discussion phase is explicitly opened.',
        );
      if (this.claimed(id, `handoff-${turnId}`, 'handoff')) return;
      if (record.deadline && Date.now() >= record.deadline)
        throw new ConflictException('The reviewed total time budget expired.');
      if (record.handoffs >= record.task.maxHandoffs)
        throw new ConflictException('The reviewed handoff budget has been reached.');
      this.claim(id, `handoff-${turnId}`, 'handoff', { turnId });
      this.update(id, { handoffs: record.handoffs + 1 }, 'handoff.authorized');
    });
  }
  proposal(id: string): ActionProposal | undefined {
    const row = this.db
      .prepare('SELECT body FROM workflow_proposals WHERE run_id=? ORDER BY rowid DESC LIMIT 1')
      .get(id);
    return row ? JSON.parse(String(row.body)) : undefined;
  }
  saveProposal(id: string, proposal: ActionProposal) {
    this.db
      .prepare(
        'INSERT INTO workflow_proposals VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      )
      .run(proposal.id, id, JSON.stringify(proposal));
  }
  syntheses(id: string): Record<string, unknown>[] {
    return this.db
      .prepare('SELECT body FROM workflow_syntheses WHERE run_id=? ORDER BY rowid')
      .all(id)
      .map((row) => JSON.parse(String(row.body)));
  }
  saveSynthesis(id: string, requestId: string, metadata: Record<string, unknown>) {
    this.transaction(() => {
      this.claim(id, requestId, 'synthesis', { turnId: metadata.turnId });
      this.db
        .prepare('INSERT INTO workflow_syntheses VALUES (?,?,?)')
        .run(String(metadata.id), id, JSON.stringify(metadata));
      this.append(id, 'synthesis.retained', metadata);
    });
  }
}
