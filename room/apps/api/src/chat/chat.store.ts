import { narration } from '../speech/narration.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAX_PEER_DEPTH, MAX_PEER_INBOX, panelistPrompt } from './panelist-delivery.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { RunStore } from '../runs/run.store.js';
import { DEBATE_SEATS } from '../runs/run.contract.js';
import { dirname } from 'node:path';
import type { AgentId, ChatSnapshot, HistoryTurn, Pose, TurnStatus } from './chat.types.js';

export interface TurnRow {
  id: string;
  agent: AgentId;
  request: string;
  prompt: string;
  text: string;
  status: TurnStatus;
  addressed_to: AgentId | null;
  from_panelist: AgentId | null;
  conversation_id: string;
  peer_depth: number;
  run_id: string;
  binding_id: string;
  config_revision: number;
  original_author: string | null;
  stream_revision: number;
}
export interface QueuedDelivery {
  id: string;
  sender: AgentId;
  recipient: AgentId;
  source_turn_id: string;
  conversation_id: string;
  depth: number;
  text: string;
  run_id: string;
}
function parseSeat(value: unknown): AgentId {
  if (value === 'a' || value === 'luna') return 'a';
  if (value === 'b' || value === 'opus') return 'b';
  throw new Error('Stored participant role is invalid.');
}
function parseSpeechSummary(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  try {
    const value: unknown = JSON.parse(input);
    if (typeof value !== 'object' || value === null || !('text' in value)) return undefined;
    const text = value.text;
    return typeof text === 'string' && text.trim().length > 0 && text.length <= 16000
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}
export class ChatStore {
  private db: DatabaseSync;
  readonly runs: RunStore;
  readonly migrationBackup?: string;
  private scope?: string;
  constructor(path: string, workspace = dirname(path)) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL;');
    const existing = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
      .get();
    const legacy = Boolean(
      existing &&
      !this.db
        .prepare('PRAGMA table_info(agents)')
        .all()
        .some((row) => row.name === 'run_id'),
    );
    if (legacy && path !== ':memory:') {
      this.migrationBackup = path + '.pre-runs-' + Date.now() + '.sqlite';
      this.db.exec("VACUUM INTO '" + this.migrationBackup.replaceAll("'", "''") + "'");
    }
    if (legacy) this.db.exec('BEGIN IMMEDIATE');
    try {
      if (legacy)
        this.transaction(() => {
          for (const name of ['agents', 'turns', 'conversations', 'peer_deliveries']) {
            if (
              this.db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
                .get(name)
            )
              this.db.exec('ALTER TABLE ' + name + ' RENAME TO legacy_' + name);
          }
        });
      this.runs = new RunStore(this.db, (action) => this.transaction(action), workspace);
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents(run_id TEXT NOT NULL,id TEXT NOT NULL,pose TEXT NOT NULL DEFAULT 'front',pose_revision INTEGER NOT NULL DEFAULT 0,error TEXT,notice TEXT,PRIMARY KEY(run_id,id));
      CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,agent TEXT NOT NULL,request TEXT NOT NULL,prompt TEXT NOT NULL,text TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,addressed_to TEXT,from_panelist TEXT,conversation_id TEXT NOT NULL,peer_depth INTEGER NOT NULL DEFAULT 0,run_id TEXT NOT NULL,binding_id TEXT NOT NULL,config_revision INTEGER NOT NULL,original_author TEXT,stream_revision INTEGER NOT NULL DEFAULT 0,UNIQUE(run_id,agent,request));
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,stopped INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS peer_deliveries(id TEXT PRIMARY KEY,source_turn_id TEXT NOT NULL UNIQUE,sender TEXT NOT NULL,recipient TEXT NOT NULL,conversation_id TEXT NOT NULL,depth INTEGER NOT NULL,recipient_turn_id TEXT UNIQUE,status TEXT NOT NULL CHECK(status IN ('queued','dispatched','completed','failed','cancelled','limited')),detail TEXT,run_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS run_peer_inbox ON peer_deliveries(run_id,recipient,status);
      CREATE TABLE IF NOT EXISTS tool_calls(id INTEGER PRIMARY KEY,turn_id TEXT NOT NULL,name TEXT NOT NULL,input TEXT NOT NULL,output TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_session_migrations(id INTEGER PRIMARY KEY,agent TEXT NOT NULL,old_session TEXT NOT NULL,new_session TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
    `);
      this.ensureAgents();
      if (legacy) {
        this.importLegacy();
        this.db.exec('COMMIT');
      }
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      this.db.close();
      throw error;
    }
    this.runs.state.migrateRetainedTurns();
    this.runs.state.recover(['a', 'b']);
    this.transaction(() => {
      for (const row of this.db
        .prepare("SELECT id,agent,run_id FROM turns WHERE status='streaming'")
        .all()) {
        const store = this.forRun(String(row.run_id));
        store.finish(String(row.id), 'failed');
        store.setError(
          parseSeat(row.agent),
          'The server restarted during a reply. Send a new message to continue.',
        );
      }
      for (const row of this.db
        .prepare(
          "SELECT id,run_id,status FROM peer_deliveries WHERE status IN ('queued','dispatched')",
        )
        .all())
        this.forRun(String(row.run_id)).changeDelivery(
          String(row.id),
          row.status === 'queued' ? 'cancelled' : 'failed',
          'The room restarted. This delivery will not be replayed automatically.',
        );
      this.db.prepare('UPDATE conversations SET stopped=1').run();
    });
  }
  currentRunId(): string {
    return this.scope ?? this.runs.currentId();
  }
  forRun(runId: string): ChatStore {
    this.runs.get(runId);
    const view = Object.create(this) as ChatStore;
    view.scope = runId;
    view.ensureAgents();
    return view;
  }
  private ensureAgents() {
    for (const id of DEBATE_SEATS)
      this.db
        .prepare('INSERT OR IGNORE INTO agents(run_id,id) VALUES (?,?)')
        .run(this.currentRunId(), id);
  }
  private importLegacy() {
    this.transaction(() => {
      if (this.db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) return;
      for (const row of this.db.prepare('SELECT * FROM legacy_agents').all()) {
        const id = parseSeat(row.id);
        this.runs.importLegacyBinding(
          id,
          row.session ? String(row.session) : undefined,
          Number(row.tool_version ?? 0),
        );
        this.db
          .prepare('UPDATE agents SET pose=?,pose_revision=?,notice=? WHERE run_id=? AND id=?')
          .run(
            row.pose ?? 'front',
            Number(row.pose_revision ?? 0),
            'Earlier messages retain their original authors. This seat starts a fresh provider session.',
            this.currentRunId(),
            id,
          );
      }
      if (
        this.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_turns'")
          .get()
      ) {
        for (const row of this.db
          .prepare('SELECT rowid,* FROM legacy_turns ORDER BY rowid')
          .all()) {
          const id = parseSeat(row.agent);
          const binding = this.runs.importLegacyBinding(id);
          const conversation = String(row.conversation_id ?? row.id);
          this.db
            .prepare('INSERT OR IGNORE INTO conversations(id,run_id,stopped) VALUES (?,?,1)')
            .run(conversation, this.currentRunId());
          this.db
            .prepare(
              'INSERT INTO turns(id,agent,request,prompt,text,status,addressed_to,from_panelist,conversation_id,peer_depth,run_id,binding_id,config_revision,original_author) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              row.id!,
              id,
              row.request!,
              row.prompt!,
              row.text ?? '',
              row.status!,
              row.addressed_to ? parseSeat(row.addressed_to) : null,
              row.from_panelist ? parseSeat(row.from_panelist) : null,
              conversation,
              Number(row.peer_depth ?? 0),
              this.currentRunId(),
              binding.id,
              1,
              row.agent === 'luna' ? 'Luna' : row.agent === 'opus' ? 'Opus' : String(row.agent),
            );
          this.runs.append(
            this.currentRunId(),
            row.from_panelist ? 'peer.prompt' : 'human.prompt',
            id,
            String(row.id),
            {
              text: String(row.prompt),
              reconstructed: true,
              originalTime: 'unknown',
              sourceRow: Number(row.rowid),
            },
          );
          if (row.status !== 'streaming')
            this.runs.append(this.currentRunId(), 'turn.finished', id, String(row.id), {
              text: String(row.text ?? ''),
              status: String(row.status),
              bindingId: binding.id,
              reconstructed: true,
              originalTime: 'unknown',
            });
        }
      }
      if (
        this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_peer_deliveries'",
          )
          .get()
      ) {
        for (const row of this.db.prepare('SELECT * FROM legacy_peer_deliveries').all())
          this.db
            .prepare('INSERT INTO peer_deliveries VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(
              row.id!,
              row.source_turn_id!,
              parseSeat(row.sender),
              parseSeat(row.recipient),
              row.conversation_id!,
              row.depth!,
              row.recipient_turn_id ?? null,
              row.status!,
              row.detail ?? null,
              this.currentRunId(),
            );
      }
      this.db.prepare('INSERT INTO schema_migrations VALUES (2,?)').run(Date.now());
    });
  }
  close() {
    this.db.close();
  }
  find(agent: AgentId, request: string): TurnRow | undefined {
    return this.db
      .prepare('SELECT * FROM turns WHERE agent=? AND request=? AND run_id=?')
      .get(agent, request, this.currentRunId()) as unknown as TurnRow | undefined;
  }
  create(
    id: string,
    agent: AgentId,
    request: string,
    prompt: string,
    expectedRevision?: number,
    trigger = 'human',
    requestedAt = Date.now(),
  ) {
    this.transaction(() => {
      const run = this.runs.get(this.currentRunId());
      if (expectedRevision !== undefined && expectedRevision !== run.revision)
        throw new ConflictException('The run configuration changed. Review the latest revision.');
      if (run.state === 'retained') throw new ConflictException('Retained runs are read-only.');
      const binding = this.runs.binding(run.id, agent);
      this.db.prepare('INSERT INTO conversations(id,run_id) VALUES (?,?)').run(id, run.id);
      this.db
        .prepare(
          "INSERT INTO turns(id,agent,request,prompt,status,conversation_id,run_id,binding_id,config_revision) VALUES (?,?,?,?,'streaming',?,?,?,?)",
        )
        .run(id, agent, request, prompt, id, run.id, binding.id, run.revision);
      const workflow = this.runs.workflows.read(run.id);
      const prior = workflow.turns[agent];
      const retryOf =
        trigger === 'workflow' &&
        prior &&
        this.db
          .prepare(
            "SELECT id FROM turns WHERE id=? AND run_id=? AND status IN ('failed','stopped')",
          )
          .get(prior, run.id)
          ? prior
          : null;
      this.runs.state.startAttempt({
        runId: run.id,
        turnId: id,
        binding,
        configRevision: run.revision,
        requestedAt,
        trigger,
        stage: workflow.stage,
        retryOf,
      });
      this.runs.append(run.id, 'human.prompt', agent, id, {
        text: prompt,
        requestId: request,
        bindingId: binding.id,
        revision: run.revision,
      });
      this.setError(agent, null);
    });
  }
  append(id: string, text: string) {
    this.db
      .prepare(
        "UPDATE turns SET text=text || ?,stream_revision=stream_revision+1 WHERE id=? AND status='streaming' AND run_id=?",
      )
      .run(text, id, this.currentRunId());
  }
  private transaction<T>(action: () => T): T {
    if (this.db.isTransaction) return action();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  turn(id: string): TurnRow {
    const row = this.db
      .prepare('SELECT * FROM turns WHERE id=? AND run_id=?')
      .get(id, this.currentRunId());
    if (!row) throw new Error('Unknown room turn.');
    return row as unknown as TurnRow;
  }
  address(id: string, recipient: AgentId) {
    const turn = this.turn(id);
    if (turn.status !== 'streaming' || turn.text.trim())
      throw new BadRequestException('Select the panelist before writing reply text.');
    if (recipient === turn.agent)
      throw new BadRequestException('Address the other panelist, not yourself.');
    if (turn.addressed_to && turn.addressed_to !== recipient)
      throw new ConflictException('This reply already has a recipient.');
    this.db.prepare('UPDATE turns SET addressed_to=? WHERE id=?').run(recipient, id);
    return {
      selected: true,
      recipient,
      detail: 'Your successfully completed reply will be queued. Delivery is not yet confirmed.',
    };
  }
  finish(id: string, status: TurnStatus, elapsedMs: number | null = null) {
    this.transaction(() => {
      const turn = this.turn(id);
      if (turn.status !== 'streaming') return;
      this.db.prepare('UPDATE turns SET status=? WHERE id=?').run(status, id);
      if (status !== 'streaming') this.runs.state.finishAttempt(id, status, Date.now(), elapsedMs);
      this.runs.append(turn.run_id, 'turn.finished', turn.agent, id, {
        text: turn.text,
        status,
        bindingId: turn.binding_id,
        revision: turn.config_revision,
      });
      for (const incoming of this.db
        .prepare("SELECT id FROM peer_deliveries WHERE recipient_turn_id=? AND status='dispatched'")
        .all(id)) {
        this.changeDelivery(
          String(incoming.id),
          status === 'completed' ? 'completed' : status === 'stopped' ? 'cancelled' : 'failed',
          status === 'completed' ? null : 'Recipient reply ' + status + '.',
        );
      }
      if (status !== 'completed' || !turn.addressed_to) return;
      const stopped = this.db
        .prepare('SELECT stopped FROM conversations WHERE id=?')
        .get(turn.conversation_id)?.stopped;
      const queued = Number(
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM peer_deliveries WHERE recipient=? AND status='queued' AND run_id=?",
          )
          .get(turn.addressed_to, this.currentRunId())?.count,
      );
      const outcome = stopped
        ? 'cancelled'
        : !turn.text.trim()
          ? 'failed'
          : turn.peer_depth >= MAX_PEER_DEPTH
            ? 'limited'
            : queued >= MAX_PEER_INBOX
              ? 'failed'
              : 'queued';
      const detail = stopped
        ? 'Conversation stopped.'
        : !turn.text.trim()
          ? 'The completed reply contained no message text.'
          : outcome === 'limited'
            ? 'Four automatic handoffs reached. Send a new message to continue.'
            : queued >= MAX_PEER_INBOX
              ? 'Panelist inbox is full. Send a new message to continue.'
              : null;
      this.db
        .prepare(
          'INSERT OR IGNORE INTO peer_deliveries(id,source_turn_id,sender,recipient,conversation_id,depth,status,detail,run_id) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          id,
          turn.agent,
          turn.addressed_to,
          turn.conversation_id,
          turn.peer_depth + 1,
          outcome,
          detail,
          turn.run_id,
        );
      this.runs.append(turn.run_id, 'delivery.changed', turn.agent, id, {
        recipient: turn.addressed_to,
        status: outcome,
        detail,
      });
    });
  }
  nextDelivery(recipient: AgentId): QueuedDelivery | undefined {
    return this.db
      .prepare(
        "SELECT d.*, t.text FROM peer_deliveries d JOIN turns t ON t.id=d.source_turn_id JOIN conversations c ON c.id=d.conversation_id WHERE d.recipient=? AND d.run_id=? AND d.status='queued' AND t.status='completed' AND c.stopped=0 ORDER BY d.rowid LIMIT 1",
      )
      .get(recipient, this.currentRunId()) as unknown as QueuedDelivery | undefined;
  }
  claimDelivery(delivery: QueuedDelivery): TurnRow | undefined {
    return this.transaction(() => {
      const current = this.nextDelivery(delivery.recipient);
      if (!current || current.id !== delivery.id) return undefined;
      const id = randomUUID();
      const binding = this.runs.binding(this.currentRunId(), current.recipient);
      const prompt = panelistPrompt({
        sender: current.sender,
        recipient: current.recipient,
        sourceTurnId: current.source_turn_id,
        text: current.text,
      });
      this.db
        .prepare(
          "INSERT INTO turns(id,agent,request,prompt,status,conversation_id,peer_depth,from_panelist,run_id,binding_id,config_revision) VALUES (?,?,?,?,'streaming',?,?,?,?,?,?)",
        )
        .run(
          id,
          current.recipient,
          `panelist-${current.id}`,
          prompt,
          current.conversation_id,
          current.depth,
          current.sender,
          this.currentRunId(),
          binding.id,
          this.runs.get(this.currentRunId()).revision,
        );
      this.db
        .prepare(
          "UPDATE peer_deliveries SET status='dispatched',recipient_turn_id=? WHERE id=? AND status='queued'",
        )
        .run(id, current.id);
      this.runs.state.startAttempt({
        runId: current.run_id,
        turnId: id,
        binding,
        configRevision: this.runs.get(current.run_id).revision,
        trigger: 'panelist',
        stage: this.runs.workflows.read(current.run_id).stage,
        parentTurnId: current.source_turn_id,
      });
      this.runs.append(this.currentRunId(), 'peer.prompt', current.recipient, id, {
        text: prompt,
        sourceTurnId: current.source_turn_id,
        sender: current.sender,
      });
      this.runs.append(
        this.currentRunId(),
        'delivery.changed',
        current.sender,
        current.source_turn_id,
        {
          deliveryId: current.id,
          recipient: current.recipient,
          status: 'dispatched',
          recipientTurnId: id,
        },
      );
      this.setError(current.recipient, null);
      return this.turn(id);
    });
  }
  private changeDelivery(id: string, status: string, detail: string | null) {
    const row = this.db
      .prepare('SELECT * FROM peer_deliveries WHERE id=? AND run_id=?')
      .get(id, this.currentRunId());
    if (!row || row.status === status) return;
    this.db
      .prepare('UPDATE peer_deliveries SET status=?,detail=? WHERE id=?')
      .run(status, detail, id);
    this.runs.append(
      this.currentRunId(),
      'delivery.changed',
      parseSeat(row.sender),
      String(row.source_turn_id),
      { deliveryId: id, recipient: row.recipient, status, detail },
    );
  }
  failDelivery(id: string, detail: string) {
    this.changeDelivery(id, 'failed', detail);
  }
  cancelConversation(id: string, detail: string) {
    this.transaction(() => {
      this.db.prepare('UPDATE conversations SET stopped=1 WHERE id=?').run(id);
      for (const delivery of this.db
        .prepare(
          "SELECT id FROM peer_deliveries WHERE conversation_id=? AND run_id=? AND status IN ('queued','dispatched')",
        )
        .all(id, this.currentRunId()))
        this.changeDelivery(String(delivery.id), 'cancelled', detail);
    });
  }
  cancelAllConversations(detail: string) {
    this.transaction(() => {
      for (const row of this.db
        .prepare('SELECT id FROM conversations WHERE run_id=?')
        .all(this.currentRunId()))
        this.cancelConversation(String(row.id), detail);
    });
  }
  busy(): boolean {
    return Boolean(
      this.db
        .prepare("SELECT id FROM turns WHERE run_id=? AND status='streaming' LIMIT 1")
        .get(this.currentRunId()) ||
      this.db
        .prepare(
          "SELECT id FROM peer_deliveries WHERE run_id=? AND status IN ('queued','dispatched') LIMIT 1",
        )
        .get(this.currentRunId()),
    );
  }
  setError(agent: AgentId, error: string | null) {
    this.db
      .prepare('UPDATE agents SET error=? WHERE id=? AND run_id=?')
      .run(error, agent, this.currentRunId());
  }
  session(agent: AgentId): string | undefined {
    return this.runs.session(this.runs.binding(this.currentRunId(), agent).id)?.continuation;
  }
  toolVersion(agent: AgentId): number {
    return this.runs.session(this.runs.binding(this.currentRunId(), agent).id)?.toolVersion ?? 0;
  }
  history(agent: AgentId): HistoryTurn[] {
    const turns = this.db
      .prepare(
        "SELECT id,prompt,text,status FROM turns WHERE agent=? AND run_id=? AND status!='streaming' ORDER BY rowid",
      )
      .all(agent, this.currentRunId());
    return turns.map((turn) => ({
      prompt: String(turn.prompt),
      text: String(turn.text),
      status: turn.status as TurnStatus,
      tools: this.db
        .prepare('SELECT name,input,output FROM tool_calls WHERE turn_id=? ORDER BY id')
        .all(String(turn.id))
        .map((tool) => ({
          name: String(tool.name),
          input: String(tool.input),
          output: String(tool.output),
        })),
    }));
  }
  setSession(agent: AgentId, session: string, toolVersion?: number) {
    this.transaction(() =>
      this.saveBindingSession(
        this.runs.binding(this.currentRunId(), agent).id,
        agent,
        session,
        toolVersion,
      ),
    );
  }
  private saveBindingSession(
    bindingId: string,
    agent: AgentId,
    session: string,
    toolVersion?: number,
  ) {
    const previous = this.runs.session(bindingId);
    if (
      previous &&
      previous.continuation !== session &&
      toolVersion !== undefined &&
      toolVersion > previous.toolVersion
    ) {
      this.db
        .prepare(
          'INSERT INTO provider_session_migrations(agent,old_session,new_session,reason,created_at) VALUES (?,?,?,?,?)',
        )
        .run(
          agent,
          previous.continuation,
          session,
          'Update room tool vocabulary; retained history is preserved.',
          Date.now(),
        );
      this.db
        .prepare('UPDATE agents SET notice=? WHERE run_id=? AND id=?')
        .run(
          'Continued in a new provider session to update expressions and room tools. Earlier messages are preserved.',
          this.currentRunId(),
          agent,
        );
    }
    this.runs.saveSession(bindingId, session, toolVersion);
  }
  saveTurnSession(turnId: string, session: string, toolVersion?: number) {
    this.transaction(() => {
      const turn = this.turn(turnId);
      if (turn.status !== 'streaming') return;
      this.saveBindingSession(turn.binding_id, turn.agent, session, toolVersion);
    });
  }
  setPose(agent: AgentId, pose: Pose) {
    this.db
      .prepare('UPDATE agents SET pose=?, pose_revision=pose_revision+1 WHERE id=? AND run_id=?')
      .run(pose, agent, this.currentRunId());
  }
  tool(id: string, name: string, input: Record<string, unknown>, output: string) {
    this.transaction(() => {
      const turn = this.turn(id);
      this.db
        .prepare('INSERT INTO tool_calls(turn_id,name,input,output) VALUES (?,?,?,?)')
        .run(
          id,
          name,
          name === 'summarize_speech'
            ? JSON.stringify(input)
            : JSON.stringify(input).slice(0, 16000),
          output.slice(0, 32000),
        );
      this.runs.append(turn.run_id, 'tool.finished', turn.agent, id, {
        name,
        input: JSON.stringify(input).slice(0, 16000),
        output: output.slice(0, 32000),
      });
    });
  }
  snapshot(agent: AgentId): ChatSnapshot {
    const row = this.db
      .prepare('SELECT pose,pose_revision,error,notice FROM agents WHERE id=? AND run_id=?')
      .get(agent, this.currentRunId())!;
    const turns = this.db
      .prepare(
        'SELECT * FROM (SELECT rowid,* FROM turns WHERE agent=? AND run_id=? ORDER BY rowid DESC LIMIT 100) ORDER BY rowid',
      )
      .all(agent, this.currentRunId()) as unknown as TurnRow[];
    const messages: ChatSnapshot['messages'] = turns.map((turn) => {
      const delivery = this.db
        .prepare('SELECT id,recipient,status,detail FROM peer_deliveries WHERE source_turn_id=?')
        .get(turn.id);
      const binding = this.runs.bindingById(turn.binding_id);
      const summary = this.db
        .prepare(
          "SELECT input FROM tool_calls WHERE turn_id=? AND name='summarize_speech' AND output='Spoken summary recorded.' ORDER BY id DESC LIMIT 1",
        )
        .get(turn.id);
      const speechSummary = parseSpeechSummary(summary?.input);
      return {
        id: turn.id,
        bindingId: binding.id,
        provider: binding.config.provider,
        model: binding.config.model,
        effort: binding.config.effort,
        partialRevision: turn.stream_revision,
        ...(turn.original_author ? { originalAuthor: turn.original_author } : {}),
        text: turn.text,
        narration: narration(speechSummary),
        ...(typeof speechSummary === 'string' ? { speechSummary } : {}),
        status: turn.status,
        ...(turn.addressed_to ? { addressedTo: turn.addressed_to } : {}),
        ...(turn.from_panelist ? { fromPanelist: turn.from_panelist } : {}),
        ...(delivery
          ? {
              delivery: {
                id: String(delivery.id),
                recipient: delivery.recipient as AgentId,
                status: delivery.status as NonNullable<
                  ChatSnapshot['messages'][number]['delivery']
                >['status'],
                ...(delivery.detail ? { detail: String(delivery.detail) } : {}),
              },
            }
          : {}),
      };
    });
    const working = turns.find((turn) => turn.status === 'streaming');
    const pendingPanelistMessages = Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM peer_deliveries WHERE recipient=? AND status='queued' AND run_id=?",
        )
        .get(agent, this.currentRunId())?.count,
    );
    return {
      runId: this.currentRunId(),
      revision: this.runs.get(this.currentRunId()).revision,
      cursor: this.runs.cursor(this.currentRunId()),
      messages,
      pendingPanelistMessages,
      ...(working
        ? { activeSource: working.from_panelist ? ('panelist' as const) : ('human' as const) }
        : {}),
      status: messages.some((m) => m.status === 'streaming')
        ? 'working'
        : row.error
          ? 'failed'
          : 'idle',
      pose: row.pose as Pose,
      poseRevision: Number(row.pose_revision),
      ...(row.error ? { error: String(row.error) } : {}),
      ...(row.notice ? { sessionNotice: String(row.notice) } : {}),
    };
  }
}
