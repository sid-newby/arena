import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { parseTask } from '../debate/workflow.store.js';
import type {
  ParticipantBinding,
  ParticipantRole,
  RunSnapshot,
  TaskDraft,
} from '../runs/run.contract.js';
import {
  confirmationSchema,
  parseStateInput,
  proposalSchema,
  type AttemptStatus,
  type CandidateEvidence,
  type Decision,
  type OutcomeRevision,
  type OutcomeSnapshot,
  type UsageObservation,
  type TokenCounts,
  unknownTokens,
} from './state.contract.js';

type Transaction = <T>(action: () => T) => T;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function json<T>(value: SQLOutputValue | undefined): T {
  return JSON.parse(String(value));
}

export class StateStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly transaction: Transaction,
    private readonly run: (id: string) => RunSnapshot,
  ) {
    this.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS state_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS state_task_revisions(run_id TEXT NOT NULL,revision INTEGER NOT NULL,task_json TEXT NOT NULL,origin TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(run_id,revision));
        CREATE TABLE IF NOT EXISTS state_attempts(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,role TEXT NOT NULL,turn_id TEXT NOT NULL,binding_id TEXT,attribution_json TEXT NOT NULL,requested_at INTEGER,started_at INTEGER,first_text_at INTEGER,finished_at INTEGER,elapsed_ms REAL,status TEXT NOT NULL,through_seq INTEGER,UNIQUE(run_id,role,turn_id));
        CREATE INDEX IF NOT EXISTS state_attempt_run ON state_attempts(run_id,requested_at,id);
        CREATE TABLE IF NOT EXISTS state_usage_observations(id INTEGER PRIMARY KEY AUTOINCREMENT,attempt_id TEXT NOT NULL,observation_key TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(attempt_id,observation_key));
        CREATE INDEX IF NOT EXISTS state_usage_attempt ON state_usage_observations(attempt_id,id);
        CREATE TABLE IF NOT EXISTS state_tool_calls(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,name TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,elapsed_ms REAL,status TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS state_tool_attempt ON state_tool_calls(attempt_id,started_at,id);
        CREATE TABLE IF NOT EXISTS state_outcome_revisions(run_id TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(run_id,revision));
        CREATE TABLE IF NOT EXISTS state_usage_baselines(binding_id TEXT NOT NULL,continuation_hash TEXT NOT NULL,tokens_json TEXT NOT NULL,PRIMARY KEY(binding_id,continuation_hash));
        CREATE TABLE IF NOT EXISTS state_commands(run_id TEXT NOT NULL,command_id TEXT NOT NULL,input_hash TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(run_id,command_id));
      `);
      if (!db.prepare('SELECT version FROM state_migrations WHERE version=1').get()) {
        for (const row of db.prepare('SELECT run_id,body FROM run_workflows').all()) {
          const record = json<{ task: unknown }>(row.body);
          if (record.task)
            this.recordTask(String(row.run_id), parseTask(record.task), 'migration-current');
        }
        db.prepare('INSERT INTO state_migrations VALUES (1,?)').run(Date.now());
      }
    });
  }
  migrateRetainedTurns() {
    this.transaction(() => {
      if (this.db.prepare('SELECT version FROM state_migrations WHERE version=2').get()) return;
      for (const row of this.db
        .prepare(
          'SELECT t.id,t.run_id,t.agent,t.status,t.config_revision,t.binding_id,t.original_author,b.config,b.instructions_version,b.tool_policy_version FROM turns t JOIN participant_bindings b ON b.id=t.binding_id',
        )
        .all()) {
        const config = json<{ provider: string; model: string; effort: string }>(row.config);
        const legacy = row.instructions_version === 'legacy-v0';
        const status = row.status === 'streaming' ? 'interrupted' : String(row.status);
        this.db
          .prepare(
            'INSERT OR IGNORE INTO state_attempts(id,run_id,role,turn_id,binding_id,attribution_json,requested_at,status) VALUES (?,?,?,?,?,?,NULL,?)',
          )
          .run(
            row.id!,
            row.run_id!,
            row.agent!,
            row.id!,
            row.binding_id!,
            JSON.stringify({
              configRevision: legacy ? null : Number(row.config_revision),
              taskRevision: null,
              provider: legacy ? null : config.provider,
              model: legacy ? null : config.model,
              effort: legacy ? null : config.effort,
              originalAuthor: row.original_author ?? null,
              attributionSource: legacy ? 'legacy-author-only' : 'recorded-binding',
              instructionsVersion: String(row.instructions_version),
              toolPolicyVersion: Number(row.tool_policy_version),
              trigger: 'unknown',
              stage: null,
              parentTurnId: null,
              retryOf: null,
              origin: 'migration-retained',
            }),
            status,
          );
      }
      this.db.prepare('INSERT INTO state_migrations VALUES (2,?)').run(Date.now());
    });
  }
  private writable(runId: string) {
    const run = this.run(runId);
    if (run.kind === 'legacy' || run.state === 'retained')
      throw new ConflictException('Retained runs are read-only.');
    return run;
  }
  recordTask(
    runId: string,
    task: TaskDraft,
    origin: 'draft-save' | 'resolved-source' | 'migration-current',
  ) {
    return this.transaction(() => {
      this.run(runId);
      const revision =
        Number(
          this.db
            .prepare('SELECT MAX(revision) AS revision FROM state_task_revisions WHERE run_id=?')
            .get(runId)?.revision ?? 0,
        ) + 1;
      this.db
        .prepare('INSERT INTO state_task_revisions VALUES (?,?,?,?,?)')
        .run(runId, revision, JSON.stringify(task), origin, Date.now());
      return revision;
    });
  }
  private task(runId: string) {
    const row = this.db
      .prepare('SELECT * FROM state_task_revisions WHERE run_id=? ORDER BY revision DESC LIMIT 1')
      .get(runId);
    return row ? { revision: Number(row.revision), task: parseTask(json(row.task_json)) } : null;
  }
  startAttempt(options: {
    runId: string;
    turnId: string;
    binding: ParticipantBinding;
    configRevision: number;
    requestedAt?: number;
    trigger: string;
    stage: string | null;
    parentTurnId?: string | null;
    retryOf?: string | null;
    throughSeq?: number;
  }) {
    const { runId, turnId, binding } = options;
    this.writable(runId);
    if (binding.runId !== runId) throw new ConflictException('The binding belongs to another run.');
    this.db
      .prepare(
        'INSERT INTO state_attempts(id,run_id,role,turn_id,binding_id,attribution_json,requested_at,status,through_seq) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        turnId,
        runId,
        binding.role,
        turnId,
        binding.id,
        JSON.stringify({
          configRevision: options.configRevision,
          taskRevision: this.task(runId)?.revision ?? null,
          provider: binding.config.provider,
          model: binding.config.model,
          effort: binding.config.effort,
          instructionsVersion: binding.instructionsVersion,
          toolPolicyVersion: binding.toolPolicyVersion,
          trigger: options.trigger,
          stage: options.stage,
          parentTurnId: options.parentTurnId ?? null,
          retryOf: options.retryOf ?? null,
          origin: 'accepted',
        }),
        options.requestedAt ?? Date.now(),
        'running',
        options.throughSeq ?? null,
      );
  }
  started(id: string) {
    this.db
      .prepare(
        "UPDATE state_attempts SET started_at=COALESCE(started_at,?) WHERE id=? AND status='running'",
      )
      .run(Date.now(), id);
  }
  firstText(id: string) {
    this.db
      .prepare(
        "UPDATE state_attempts SET first_text_at=COALESCE(first_text_at,?) WHERE id=? AND status='running'",
      )
      .run(Date.now(), id);
  }
  finishAttempt(
    id: string,
    status: Exclude<AttemptStatus, 'running'>,
    finishedAt: number | null = Date.now(),
    elapsedMs: number | null = null,
  ) {
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE state_attempts SET status=?,finished_at=?,elapsed_ms=? WHERE id=? AND status='running'",
        )
        .run(status, finishedAt, elapsedMs, id);
      this.db
        .prepare(
          "UPDATE state_tool_calls SET status='interrupted' WHERE attempt_id=? AND status='running'",
        )
        .run(id);
    });
  }
  recover(roles: ParticipantRole[]) {
    this.transaction(() => {
      for (const role of roles)
        for (const row of this.db
          .prepare("SELECT id FROM state_attempts WHERE role=? AND status='running'")
          .all(role))
          this.finishAttempt(String(row.id), 'interrupted', null, null);
    });
  }
  baseline(bindingId: string, continuation: string): TokenCounts | undefined {
    const row = this.db
      .prepare(
        'SELECT tokens_json FROM state_usage_baselines WHERE binding_id=? AND continuation_hash=?',
      )
      .get(bindingId, hash(continuation));
    return row ? json<TokenCounts>(row.tokens_json) : undefined;
  }
  saveBaseline(bindingId: string, continuation: string, tokens: TokenCounts) {
    this.db
      .prepare(
        'INSERT INTO state_usage_baselines VALUES (?,?,?) ON CONFLICT(binding_id,continuation_hash) DO UPDATE SET tokens_json=excluded.tokens_json',
      )
      .run(bindingId, hash(continuation), JSON.stringify(tokens));
  }
  usage(id: string, observation: UsageObservation) {
    const attempt = this.db.prepare('SELECT id FROM state_attempts WHERE id=?').get(id);
    if (!attempt) throw new Error('Usage requires a durable attempt.');
    const values = [
      ...Object.values(observation.tokens),
      observation.costUsd,
      observation.providerDurationMs,
    ];
    if (values.some((value) => value !== null && (!Number.isFinite(value) || value < 0)))
      throw new Error('Usage values must be nonnegative or unknown.');
    const serialized = JSON.stringify(observation);
    const prior = this.db
      .prepare(
        'SELECT body_json FROM state_usage_observations WHERE attempt_id=? AND observation_key=?',
      )
      .get(id, observation.key);
    if (prior) {
      if (prior.body_json !== serialized)
        throw new ConflictException('Usage observation identity was reused.');
      return;
    }
    this.db
      .prepare(
        'INSERT INTO state_usage_observations(attempt_id,observation_key,body_json,created_at) VALUES (?,?,?,?)',
      )
      .run(id, observation.key, serialized, Date.now());
  }
  startTool(attemptId: string, name: string) {
    if (
      !this.db
        .prepare("SELECT id FROM state_attempts WHERE id=? AND status='running'")
        .get(attemptId)
    )
      throw new ConflictException('Tool execution requires an active durable attempt.');
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO state_tool_calls(id,attempt_id,name,started_at,status) VALUES (?,?,?,?,'running')",
      )
      .run(id, attemptId, name, Date.now());
    return id;
  }
  finishTool(id: string, status: 'succeeded' | 'failed' | 'interrupted', elapsedMs: number) {
    this.db
      .prepare(
        "UPDATE state_tool_calls SET status=?,finished_at=?,elapsed_ms=? WHERE id=? AND status='running'",
      )
      .run(status, Date.now(), elapsedMs, id);
  }
  private outcomeRows(runId: string) {
    return this.db
      .prepare(
        'SELECT body_json FROM state_outcome_revisions WHERE run_id=? ORDER BY revision DESC LIMIT 100',
      )
      .all(runId)
      .map((row) => json<OutcomeRevision>(row.body_json))
      .toReversed();
  }
  outcomes(runId: string): OutcomeSnapshot {
    const run = this.run(runId);
    const history = this.outcomeRows(runId),
      task = this.task(runId);
    const latest = (kind: 'proposed' | 'confirmed') => {
      const row = this.db
        .prepare(
          'SELECT body_json FROM state_outcome_revisions WHERE run_id=? AND kind=? ORDER BY revision DESC LIMIT 1',
        )
        .get(runId, kind);
      return row ? json<OutcomeRevision>(row.body_json) : null;
    };
    const latestProposal = latest('proposed'),
      latestConfirmed = latest('confirmed');
    const source = latestProposal
      ? this.db
          .prepare("SELECT status FROM state_attempts WHERE id=? AND run_id=? AND role='maestro'")
          .get(latestProposal.sourceMaestroTurnId, runId)
      : null;
    return {
      runId,
      revision: history.at(-1)?.revision ?? 0,
      task: task ? { revision: task.revision, criteria: task.task.criteria } : null,
      latestProposal,
      latestConfirmed,
      canConfirm:
        run.kind !== 'legacy' &&
        run.state !== 'retained' &&
        latestProposal !== null &&
        latestConfirmed?.proposalRevision !== latestProposal.revision &&
        latestProposal.taskRevision === task?.revision &&
        source?.status === 'completed',
      history,
    };
  }
  private validateCriteria(decision: Decision, task: TaskDraft) {
    const indices = decision.criteria.map((item) => item.index);
    if (
      indices.length !== task.criteria.length ||
      new Set(indices).size !== indices.length ||
      indices.some((index) => index >= task.criteria.length)
    )
      throw new BadRequestException(
        'Assess every current criterion exactly once by its zero-based index.',
      );
  }
  private replay(runId: string, commandId: string, inputHash: string): OutcomeSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM state_commands WHERE run_id=? AND command_id=?')
      .get(runId, commandId);
    if (!row) return null;
    if (row.input_hash !== inputHash)
      throw new ConflictException('This requestId already names a different state command.');
    return json<OutcomeSnapshot>(row.result_json);
  }
  private saveOutcome(
    runId: string,
    value: Omit<OutcomeRevision, 'revision' | 'createdAt'>,
    commandId: string,
    inputHash: string,
  ) {
    const revision =
      Number(
        this.db
          .prepare('SELECT MAX(revision) AS revision FROM state_outcome_revisions WHERE run_id=?')
          .get(runId)?.revision ?? 0,
      ) + 1;
    const outcome: OutcomeRevision = { ...value, revision, createdAt: Date.now() };
    this.db
      .prepare('INSERT INTO state_outcome_revisions VALUES (?,?,?,?,?)')
      .run(runId, revision, value.kind, JSON.stringify(outcome), outcome.createdAt);
    const snapshot = this.outcomes(runId);
    this.db
      .prepare('INSERT INTO state_commands VALUES (?,?,?,?)')
      .run(runId, commandId, inputHash, JSON.stringify(snapshot));
    return snapshot;
  }
  private candidate(
    runId: string,
    seat: 'a' | 'b',
    id: string,
    throughSeq: number,
  ): CandidateEvidence {
    const row = this.db
      .prepare(
        'SELECT t.id,t.binding_id,t.text,t.status,b.config,b.instructions_version FROM turns t JOIN participant_bindings b ON b.id=t.binding_id WHERE t.id=? AND t.run_id=? AND t.agent=? AND b.run_id=? AND b.role=?',
      )
      .get(id, runId, seat, runId, seat);
    const finished = this.db
      .prepare(
        "SELECT seq FROM correspondence WHERE run_id=? AND turn_id=? AND kind='turn.finished' AND seq<=?",
      )
      .get(runId, id, throughSeq);
    if (!row || row.status !== 'completed' || !finished)
      throw new ConflictException(
        'Candidates must be completed turns from their run and seat within the captured evidence boundary.',
      );
    if (row.instructions_version === 'legacy-v0')
      throw new ConflictException(
        'Candidates require a recorded exact model. Run a fresh candidate turn.',
      );
    const config = json<{ provider: string; model: string }>(row.config);
    return {
      turnId: id,
      bindingId: String(row.binding_id),
      provider: config.provider,
      model: config.model,
      sha256: hash(String(row.text)),
    };
  }
  propose(runId: string, source: { turnId: string; throughSeq: number }, input: unknown) {
    const command = parseStateInput(proposalSchema, input);
    command.decision.criteria.sort((left, right) => left.index - right.index);
    const inputHash = hash(JSON.stringify(command));
    const commandId = `proposal:${source.turnId}:${inputHash}`;
    return this.transaction(() => {
      const replay = this.replay(runId, commandId, inputHash);
      if (replay) return replay;
      this.writable(runId);
      const attempt = this.db
        .prepare("SELECT * FROM state_attempts WHERE id=? AND run_id=? AND role='maestro'")
        .get(source.turnId, runId);
      if (!attempt || attempt.status !== 'running' || attempt.through_seq !== source.throughSeq)
        throw new ConflictException(
          'Proposal requires the invoking Maestro attempt and captured evidence boundary.',
        );
      const task = this.task(runId);
      if (!task || task.revision !== command.taskRevision)
        throw new ConflictException('The task revision changed. Read the current session state.');
      this.validateCriteria(command.decision, task.task);
      const candidates = {
        a: this.candidate(runId, 'a', command.candidateTurnIds.a, source.throughSeq),
        b: this.candidate(runId, 'b', command.candidateTurnIds.b, source.throughSeq),
      };
      return this.saveOutcome(
        runId,
        {
          kind: 'proposed',
          proposalRevision: null,
          sourceMaestroTurnId: source.turnId,
          taskRevision: task.revision,
          decision: command.decision,
          candidates,
        },
        commandId,
        inputHash,
      );
    });
  }
  confirm(runId: string, proposalRevision: number, input: unknown) {
    const command = parseStateInput(confirmationSchema, input);
    command.decision.criteria.sort((left, right) => left.index - right.index);
    if (!Number.isSafeInteger(proposalRevision) || proposalRevision < 1)
      throw new BadRequestException('Choose an outcome proposal revision.');
    const inputHash = hash(JSON.stringify({ proposalRevision, ...command }));
    return this.transaction(() => {
      const replay = this.replay(runId, `confirmation:${command.requestId}`, inputHash);
      if (replay) return replay;
      this.writable(runId);
      const snapshot = this.outcomes(runId),
        proposal = snapshot.latestProposal;
      if (
        snapshot.revision !== command.expectedRevision ||
        !proposal ||
        proposal.revision !== proposalRevision ||
        !snapshot.canConfirm
      )
        throw new ConflictException(
          'The outcome or task changed, or its source Maestro attempt is incomplete. Refresh before confirming.',
        );
      const task = this.task(runId);
      if (!task) throw new ConflictException('The task is missing.');
      this.validateCriteria(command.decision, task.task);
      return this.saveOutcome(
        runId,
        { ...proposal, kind: 'confirmed', proposalRevision, decision: command.decision },
        `confirmation:${command.requestId}`,
        inputHash,
      );
    });
  }
  get(runId: string, after = 0, limit = 100) {
    const run = this.run(runId);
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new BadRequestException('Choose a nonnegative offset and limit from 1 to 500.');
    const attempts = this.db
      .prepare(
        'SELECT * FROM state_attempts WHERE run_id=? ORDER BY requested_at,rowid LIMIT ? OFFSET ?',
      )
      .all(runId, limit, after)
      .map((row) => {
        const usage = this.db
          .prepare('SELECT body_json FROM state_usage_observations WHERE attempt_id=? ORDER BY id')
          .all(row.id!)
          .map((observation) => json<UsageObservation>(observation.body_json));
        const scoped = usage.findLast(
          (item) =>
            item.source === 'anthropic.result.usage' ||
            item.source.startsWith('codex.thread.total'),
        );
        return {
          id: String(row.id),
          turnId: String(row.turn_id),
          role: String(row.role),
          bindingId: row.binding_id === null ? null : String(row.binding_id),
          ...json<Record<string, unknown>>(row.attribution_json),
          tokens: scoped?.scope === 'turn' ? scoped.tokens : unknownTokens(),
          status: String(row.status),
          requestedAt: row.requested_at === null ? null : Number(row.requested_at),
          startedAt: row.started_at,
          firstTextAt: row.first_text_at,
          finishedAt: row.finished_at,
          elapsedMs: row.elapsed_ms,
          usage,
          tools: this.db
            .prepare(
              'SELECT id,name,started_at,finished_at,elapsed_ms,status FROM state_tool_calls WHERE attempt_id=? ORDER BY started_at,rowid',
            )
            .all(row.id!)
            .map((tool) => ({
              id: tool.id,
              name: tool.name,
              startedAt: tool.started_at,
              finishedAt: tool.finished_at,
              elapsedMs: tool.elapsed_ms,
              status: tool.status,
            })),
        };
      });
    const count = Number(
      this.db.prepare('SELECT COUNT(*) AS count FROM state_attempts WHERE run_id=?').get(runId)
        ?.count ?? 0,
    );
    const taskRevisions = this.db
      .prepare('SELECT * FROM state_task_revisions WHERE run_id=? ORDER BY revision DESC LIMIT 100')
      .all(runId)
      .map((row) => ({
        revision: Number(row.revision),
        task: parseTask(json(row.task_json)),
        origin: String(row.origin),
        createdAt: Number(row.created_at),
      }));
    return {
      run,
      taskRevisions,
      attempts,
      nextOffset: after + attempts.length < count ? after + attempts.length : null,
      outcomes: this.outcomes(runId),
    };
  }
}
