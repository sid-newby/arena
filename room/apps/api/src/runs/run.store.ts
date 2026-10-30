import { ReportRepository } from '../reports/report.repository.js';
import { parseProviderConfig } from './provider-config.js';
import { StateStore } from '../state/state.store.js';
import { WorkflowStore } from '../debate/workflow.store.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  DEBATE_SEATS,
  DEFAULT_MODELS,
  type Correspondence,
  type ParticipantBinding,
  type ParticipantRole,
  type ProviderConfig,
  type RunSnapshot,
  type SeatId,
} from './run.contract.js';

type Row = Record<string, SQLOutputValue>;
type Transaction = <T>(action: () => T) => T;

export class RunStore {
  readonly workflows: WorkflowStore;
  readonly state: StateStore;
  readonly reports: ReportRepository;
  constructor(
    private readonly db: DatabaseSync,
    private readonly transaction: Transaction,
    private readonly workspace: string,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS room_state(id INTEGER PRIMARY KEY CHECK(id=1),current_run TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS run_configurations(run_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(run_id,revision));
      CREATE TABLE IF NOT EXISTS participant_bindings(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,role TEXT NOT NULL,config TEXT NOT NULL,workspace TEXT NOT NULL,instructions_version TEXT NOT NULL,tool_policy_version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS participant_assignments(run_id TEXT NOT NULL,role TEXT NOT NULL,binding_id TEXT NOT NULL,PRIMARY KEY(run_id,role));
      CREATE TABLE IF NOT EXISTS binding_sessions(binding_id TEXT PRIMARY KEY,continuation TEXT NOT NULL,tool_version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS correspondence(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,kind TEXT NOT NULL,role TEXT,turn_id TEXT,payload TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS correspondence_run ON correspondence(run_id,seq);
      CREATE TABLE IF NOT EXISTS run_clones(request_id TEXT PRIMARY KEY,source_run TEXT NOT NULL,source_revision INTEGER NOT NULL,source_choice TEXT NOT NULL,target_run TEXT NOT NULL);
    `);
    db.exec(
      'CREATE TABLE IF NOT EXISTS binding_policies(binding_id TEXT PRIMARY KEY,profile TEXT NOT NULL)',
    );
    this.workflows = new WorkflowStore(
      db,
      transaction,
      (id) => this.get(id),
      (id, kind, payload) => this.append(id, kind, null, null, payload),
    );
    this.state = new StateStore(db, transaction, (id) => this.get(id));
    this.reports = new ReportRepository(db);
    if (!db.prepare('SELECT current_run FROM room_state WHERE id=1').get()) {
      this.transaction(() => {
        const run = this.create('ordinary');
        db.prepare('INSERT INTO room_state(id,current_run) VALUES (1,?)').run(run.id);
      });
    }
  }

  currentId(): string {
    return String(
      this.db.prepare('SELECT current_run FROM room_state WHERE id=1').get()!.current_run,
    );
  }
  current(): RunSnapshot {
    return this.get(this.currentId());
  }
  list(): RunSnapshot[] {
    return this.db
      .prepare('SELECT id FROM runs ORDER BY created_at,id')
      .all()
      .map((row) => this.get(String(row.id)));
  }
  get(id: string): RunSnapshot {
    const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if (!row) throw new NotFoundException('Unknown run.');
    const config = this.configuration(id, Number(row.revision));
    const kind = row.kind === 'legacy' ? 'legacy' : 'ordinary';
    const state =
      row.state === 'retained' ? 'retained' : row.state === 'interrupted' ? 'interrupted' : 'ready';
    return {
      id,
      kind,
      state,
      revision: Number(row.revision),
      createdAt: Number(row.created_at),
      ...config,
    };
  }
  private configuration(id: string, revision: number) {
    const row = this.db
      .prepare('SELECT body FROM run_configurations WHERE run_id=? AND revision=?')
      .get(id, revision);
    if (!row) throw new Error('Run configuration is missing.');
    const value: unknown = JSON.parse(String(row.body));
    if (
      !value ||
      typeof value !== 'object' ||
      !('a' in value) ||
      !('b' in value) ||
      !('maestro' in value)
    )
      throw new Error('Stored run configuration is invalid.');
    return {
      seats: { a: parseProviderConfig(value.a), b: parseProviderConfig(value.b) },
      maestro: parseProviderConfig(value.maestro),
    };
  }
  create(kind: RunSnapshot['kind'] = 'ordinary', id: string = randomUUID()): RunSnapshot {
    return this.transaction(() => {
      this.db
        .prepare('INSERT INTO runs VALUES (?,?,?,?,?)')
        .run(id, kind, kind === 'legacy' ? 'retained' : 'ready', 1, Date.now());
      this.db
        .prepare('INSERT INTO run_configurations VALUES (?,?,?)')
        .run(id, 1, JSON.stringify(DEFAULT_MODELS));
      for (const role of [...DEBATE_SEATS, 'maestro'] as const)
        this.assign(id, role, DEFAULT_MODELS[role]);
      this.append(id, 'run.created', null, null, { kind, revision: 1 });
      return this.get(id);
    });
  }
  cloneReceipt(requestId: string, sourceRun: string, sourceRevision: number, sourceChoice: string) {
    const row = this.db.prepare('SELECT * FROM run_clones WHERE request_id=?').get(requestId);
    if (!row) return undefined;
    if (
      row.source_run !== sourceRun ||
      row.source_revision !== sourceRevision ||
      row.source_choice !== sourceChoice
    )
      throw new ConflictException('This request ID belongs to a different setup copy.');
    return this.get(String(row.target_run));
  }
  cloneSetup(
    requestId: string,
    sourceRun: string,
    sourceRevision: number,
    sourceChoice: 'saved' | 'head',
  ) {
    return this.transaction(() => {
      const previous = this.cloneReceipt(requestId, sourceRun, sourceRevision, sourceChoice);
      if (previous) return previous;
      const source = this.get(sourceRun);
      if (source.revision !== sourceRevision)
        throw new ConflictException('The source setup changed. Review it again.');
      const task = this.workflows.read(sourceRun).task;
      if (!task) throw new BadRequestException('Save a task before copying this setup.');
      const copiedTask =
        sourceChoice === 'head' && task.source
          ? { ...task, source: { ...task.source, revision: 'HEAD' } }
          : task;
      const created = this.create();
      const configured = this.configure(created.id, created.revision, source.seats, () => false);
      this.revise(configured.id, configured.revision, () => {
        this.workflows.update(created.id, { task: copiedTask, phase: 'draft' }, 'task.updated');
        this.state.recordTask(created.id, copiedTask, 'draft-save');
      });
      this.db
        .prepare('INSERT INTO run_clones VALUES (?,?,?,?,?)')
        .run(requestId, sourceRun, sourceRevision, sourceChoice, created.id);
      return this.get(created.id);
    });
  }
  select(id: string) {
    const run = this.get(id);
    this.db.prepare('UPDATE room_state SET current_run=? WHERE id=1').run(id);
    return run;
  }
  binding(runId: string, role: ParticipantRole): ParticipantBinding {
    this.get(runId);
    const row = this.db
      .prepare(
        'SELECT b.* FROM participant_assignments a JOIN participant_bindings b ON b.id=a.binding_id WHERE a.run_id=? AND a.role=?',
      )
      .get(runId, role);
    if (!row) throw new Error('Participant binding is missing.');
    return this.bindingRow(row);
  }
  bindingById(id: string): ParticipantBinding {
    const row = this.db.prepare('SELECT * FROM participant_bindings WHERE id=?').get(id);
    if (!row) throw new Error('Participant binding is missing.');
    return this.bindingRow(row);
  }
  private bindingRow(row: Row): ParticipantBinding {
    const role = row.role;
    if (role !== 'a' && role !== 'b' && role !== 'maestro')
      throw new Error('Stored participant role is invalid.');
    return {
      id: String(row.id),
      runId: String(row.run_id),
      role,
      config: parseProviderConfig(JSON.parse(String(row.config))),
      workspace: String(row.workspace),
      instructionsVersion: String(row.instructions_version),
      toolPolicyVersion: Number(row.tool_policy_version),
      ...this.bindingProfile(String(row.id)),
    };
  }
  private bindingProfile(id: string): { toolProfile?: 'analysis' | 'build' } {
    const profile = this.db
      .prepare('SELECT profile FROM binding_policies WHERE binding_id=?')
      .get(id)?.profile;
    return profile === 'analysis' || profile === 'build' ? { toolProfile: profile } : {};
  }
  private assign(
    runId: string,
    role: ParticipantRole,
    config: ProviderConfig,
    workspace = this.workspace,
    profile?: 'analysis' | 'build',
  ): ParticipantBinding {
    const id: string = randomUUID();
    this.db
      .prepare('INSERT INTO participant_bindings VALUES (?,?,?,?,?,?,?)')
      .run(
        id,
        runId,
        role,
        JSON.stringify(config),
        workspace,
        profile ? 'workspace-v1' : 'room-v1',
        profile ? 5 : 4,
      );
    if (profile) this.db.prepare('INSERT INTO binding_policies VALUES (?,?)').run(id, profile);
    this.db
      .prepare(
        'INSERT INTO participant_assignments VALUES (?,?,?) ON CONFLICT(run_id,role) DO UPDATE SET binding_id=excluded.binding_id',
      )
      .run(runId, role, id);
    return this.bindingById(id);
  }
  importLegacyBinding(role: SeatId, continuation?: string, toolVersion = 0): ParticipantBinding {
    const id = `legacy-${role}`;
    this.db
      .prepare('INSERT OR IGNORE INTO participant_bindings VALUES (?,?,?,?,?,?,?)')
      .run(
        id,
        this.currentId(),
        role,
        JSON.stringify(DEFAULT_MODELS[role]),
        this.workspace,
        'legacy-v0',
        toolVersion,
      );
    if (continuation)
      this.db
        .prepare('INSERT OR IGNORE INTO binding_sessions VALUES (?,?,?)')
        .run(id, continuation, toolVersion);
    return this.bindingById(id);
  }
  configure(
    runId: string,
    expectedRevision: number,
    selections: Record<SeatId, ProviderConfig>,
    busy: () => boolean,
  ): RunSnapshot {
    return this.transaction(() => {
      const run = this.get(runId);
      if (run.kind === 'legacy' || run.state === 'retained')
        throw new ConflictException('Retained runs are read-only.');
      if (run.revision !== expectedRevision)
        throw new ConflictException('The run configuration changed. Review the latest revision.');
      if (busy())
        throw new ConflictException(
          'Wait for active turns and queued deliveries before changing models.',
        );
      const workflow = this.workflows.read(runId);
      if (workflow.startedAt !== null || workflow.phase === 'preparing')
        throw new ConflictException('This task is frozen. Create a new run to change its models.');
      if (workflow.task) this.workflows.update(runId, { phase: 'draft' });
      const next = { ...selections, maestro: run.maestro };
      const revision = run.revision + 1;
      this.db
        .prepare('INSERT INTO run_configurations VALUES (?,?,?)')
        .run(runId, revision, JSON.stringify(next));
      for (const role of DEBATE_SEATS) {
        if (JSON.stringify(run.seats[role]) !== JSON.stringify(selections[role]))
          this.assign(runId, role, selections[role]);
      }
      this.db
        .prepare('UPDATE runs SET revision=? WHERE id=? AND revision=?')
        .run(revision, runId, expectedRevision);
      this.append(runId, 'configuration.changed', null, null, { revision, seats: selections });
      return this.get(runId);
    });
  }

  revise(runId: string, expectedRevision: number, operation: () => void) {
    return this.transaction(() => {
      const run = this.get(runId);
      if (run.kind === 'legacy' || run.state === 'retained')
        throw new ConflictException('Retained runs are read-only.');
      this.workflows.check(runId, expectedRevision);
      operation();
      const revision = run.revision + 1;
      this.db
        .prepare('INSERT INTO run_configurations VALUES (?,?,?)')
        .run(runId, revision, JSON.stringify({ ...run.seats, maestro: run.maestro }));
      this.db.prepare('UPDATE runs SET revision=? WHERE id=?').run(revision, runId);
      return this.get(runId);
    });
  }
  attachWorkspaces(
    runId: string,
    expectedRevision: number,
    roots: Record<SeatId, string>,
    profile: 'analysis' | 'build',
    ready: () => void,
  ) {
    return this.revise(runId, expectedRevision, () => {
      const run = this.get(runId);
      for (const role of DEBATE_SEATS)
        this.assign(runId, role, run.seats[role], roots[role], profile);
      this.append(runId, 'workspaces.bound', null, null, { roots, profile });
      ready();
    });
  }
  session(bindingId: string): { continuation: string; toolVersion: number } | undefined {
    const row = this.db.prepare('SELECT * FROM binding_sessions WHERE binding_id=?').get(bindingId);
    return row
      ? { continuation: String(row.continuation), toolVersion: Number(row.tool_version) }
      : undefined;
  }
  saveSession(bindingId: string, continuation: string, toolVersion?: number) {
    const binding = this.bindingById(bindingId);
    const prior = this.session(bindingId);
    this.db
      .prepare(
        'INSERT INTO binding_sessions VALUES (?,?,?) ON CONFLICT(binding_id) DO UPDATE SET continuation=excluded.continuation,tool_version=excluded.tool_version',
      )
      .run(bindingId, continuation, toolVersion ?? prior?.toolVersion ?? 0);
    if (prior?.continuation !== continuation)
      this.append(binding.runId, 'session.started', binding.role, null, {
        bindingId,
        model: binding.config.model,
        previous: Boolean(prior),
      });
  }
  append(
    runId: string,
    kind: string,
    role: ParticipantRole | null,
    turnId: string | null,
    payload: Record<string, unknown>,
  ) {
    this.db
      .prepare(
        'INSERT INTO correspondence(run_id,kind,role,turn_id,payload,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(runId, kind, role, turnId, JSON.stringify(payload), Date.now());
  }
  cursor(runId: string): number {
    return Number(
      this.db.prepare('SELECT MAX(seq) AS seq FROM correspondence WHERE run_id=?').get(runId)
        ?.seq ?? 0,
    );
  }
  correspondence(runId: string, after = 0, limit = 100): Correspondence[] {
    this.get(runId);
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      throw new BadRequestException('Use a nonnegative event cursor and a limit from 1 to 500.');
    return this.db
      .prepare('SELECT * FROM correspondence WHERE run_id=? AND seq>? ORDER BY seq LIMIT ?')
      .all(runId, after, limit)
      .map((row) => {
        const role =
          row.role === 'a' || row.role === 'b' || row.role === 'maestro' ? row.role : null;
        return {
          seq: Number(row.seq),
          runId,
          kind: String(row.kind),
          role,
          turnId: row.turn_id === null ? null : String(row.turn_id),
          payload: JSON.parse(String(row.payload)),
          createdAt: Number(row.created_at),
        };
      });
  }
}
