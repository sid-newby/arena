import { LiveProjectTools } from '../tools/tool-broker.js';
import { bindHangoutProject, verifyHangoutProject } from '../workspaces/hangout-project.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HonchoClient } from '../memory/honcho-client.js';
import { HANGOUT_ID, recallTool } from '../memory/room-memory.js';
import { recallRoomMessages } from '../memory/honcho-recall.js';
import { modelName } from '../runs/participant-name.js';
import { SideConversationService } from './side-conversation.service.js';
import {
  MESSAGE_INTENTS,
  type MessageReceipt,
  type WorkflowInvalidation,
} from './message.contract.js';
import { UnconfirmedCancellationError } from './runtime-cancellation.js';
import type { SpeechReference } from '../speech/speech.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Observable } from 'rxjs';
import { PanelExpressions } from './panel-expression.js';
import { ChatStore, type TurnRow } from './chat.store.js';
import { createParticipantRuntime, discoverModels } from './runtimes.js';
import { parseProviderConfig } from '../runs/provider-config.js';
import {
  DEBATE_SEATS,
  type ParticipantBinding,
  type ProviderCatalog,
  type ProviderId,
} from '../runs/run.contract.js';
import { whisperPeerTool, type PeerWhispers } from './peer-whispers.js';
import {
  PANEL_TARGETS,
  ROOM_TOOL_VERSION,
  HANGOUT_TOOL_VERSION,
  panelPose,
  type PanelTarget,
} from './panel-presence.js';
import { PANELISTS } from './panelist-delivery.js';
import { FollowUps } from './follow-ups.js';
import { hangoutInstructions, hangoutParticipationTools, runtimeTools } from './runtime-tools.js';
import type {
  AgentId,
  AgentRuntime,
  ChatSnapshot,
  ChatExecutionPolicy,
  Pose,
} from './chat.types.js';

@Injectable()
export class ChatService implements OnModuleDestroy {
  private readonly active = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<void>;
      turn: TurnRow;
      /** Present when this runtime can read Sid's follow-ups mid-reply. */
      inbox?: FollowUps;
    }
  >();
  private readonly humanWaiters = new Map<string, number>();
  private drainScheduled = false;
  private initialized = false;
  private readonly drainRuns = new Set<string>();
  private readonly messagePumps = new Set<string>();
  private unsubscribeCommits?: () => void;
  private sideService?: SideConversationService;
  private peerWhispers?: PeerWhispers;
  private readonly projectTools = new LiveProjectTools();
  private projectCalls = 0;
  private destroyed = false;
  private readonly stopEpochs = new Map<string, number>();
  private readonly seatStopEpochs = new Map<string, number>();
  private readonly listeners = new Map<string, Set<(snapshot: ChatSnapshot) => void>>();
  private readonly expressionRuns = new Map<string, PanelExpressions>();
  private readonly runtimeCache = new Map<string, AgentRuntime>();
  private runtimeFactory: (binding: ParticipantBinding) => AgentRuntime = (
    binding: ParticipantBinding,
  ) => createParticipantRuntime(binding.role, binding.config, binding.workspace);
  private catalogReader: (provider: ProviderId) => Promise<ProviderCatalog> = discoverModels;
  private readonly workspace: string;
  private readonly store: ChatStore;
  private executionPolicy?: ChatExecutionPolicy;
  constructor() {
    this.workspace = resolve(
      process.env.ROOM_WORKSPACE ?? fileURLToPath(new URL('../../../../', import.meta.url)),
    );
    const dbPath = process.env.ROOM_DB_PATH ?? resolve(this.workspace, '.room/chat.sqlite');
    this.store = new ChatStore(dbPath, this.workspace);
    const configPath = join(dirname(dbPath), 'honcho-project');
    const gcpProject =
      process.env.HONCHO_GCP_PROJECT?.trim() ||
      (dbPath !== ':memory:' && existsSync(configPath)
        ? readFileSync(configPath, 'utf8').trim()
        : '');
    if (gcpProject)
      this.store.runs.enableMemory(
        new HonchoClient({ gcpProject }),
        (channel) => new HonchoClient({ gcpProject, workspace: 'arena-whisper-' + channel }),
      );
    this.observeCommits();
  }
  static forTest(
    store: ChatStore,
    runtimes: Record<AgentId, AgentRuntime>,
    workspace: string,
    options: {
      catalogReader?: (provider: ProviderId) => Promise<ProviderCatalog>;
      runtimeFactory?: (binding: ParticipantBinding) => AgentRuntime;
      initialize?: boolean;
    } = {},
  ): ChatService {
    const service = Object.assign(Object.create(ChatService.prototype), {
      store,
      workspace,
      active: new Map(),
      humanWaiters: new Map(),
      messagePumps: new Set(),
      drainScheduled: false,
      initialized: false,
      drainRuns: new Set(),
      destroyed: false,
      stopEpochs: new Map(),
      seatStopEpochs: new Map(),
      listeners: new Map(),
      expressionRuns: new Map(),
      runtimeCache: new Map(),
      projectTools: new LiveProjectTools(),
      projectCalls: 0,
      runtimeFactory:
        options.runtimeFactory ??
        ((binding: ParticipantBinding) => runtimes[binding.role === 'b' ? 'b' : 'a']),
      catalogReader: options.catalogReader ?? discoverModels,
    }) as ChatService;
    service.observeCommits();
    if (options.initialize !== false) service.onModuleInit();
    return service;
  }
  private observeCommits() {
    this.unsubscribeCommits = this.store.onCommit((runId) => {
      if (this.destroyed) return;
      this.emitBoth(runId);
      this.scheduleDrain(runId);
    });
  }
  onModuleInit() {
    this.initialized = true;
    for (const run of this.store.runs.list()) this.scheduleDrain(run.id);
  }
  committed(listener: (runId: string) => void) {
    return this.store.onCommit(listener);
  }
  workflowEvents(runId: string) {
    this.store.runs.get(runId);
    return new Observable<{ data: WorkflowInvalidation }>((subscriber) => {
      const send = () =>
        subscriber.next({
          data: {
            runId,
            revision: this.run(runId).revision,
            cursor: this.store.runs.cursor(runId),
          },
        });
      const unsubscribe = this.committed((id) => {
        if (id === runId) send();
      });
      send();
      return unsubscribe;
    });
  }
  private side() {
    return (this.sideService ??= new SideConversationService(
      this.store,
      (binding) => this.runtimeFactory(binding),
      this.workspace,
    ));
  }
  sideSnapshot(runId: string, seat: AgentId) {
    return this.side().snapshot(runId, seat);
  }
  sideEvents(runId: string, seat: AgentId) {
    return this.side().events(runId, seat);
  }
  submitSide(runId: string, seat: AgentId, body: unknown) {
    return this.side().submit(runId, seat, body);
  }
  stopSide(runId: string, seat: AgentId) {
    return this.side().stop(runId, seat);
  }
  agent(value: string): AgentId {
    if (value !== 'a' && value !== 'b') throw new NotFoundException('Unknown agent');
    return value;
  }
  private key(agent: AgentId, runId: string) {
    return JSON.stringify([runId, agent]);
  }
  private expressions(runId: string) {
    let expressions = this.expressionRuns.get(runId);
    if (!expressions) {
      expressions = new PanelExpressions((agent) => this.emit(agent, runId));
      this.expressionRuns.set(runId, expressions);
    }
    return expressions;
  }
  private runtime(binding: ParticipantBinding): AgentRuntime {
    let runtime = this.runtimeCache.get(binding.id);
    if (!runtime) {
      runtime = this.runtimeFactory(binding);
      this.runtimeCache.set(binding.id, runtime);
    }
    return runtime;
  }
  setExecutionPolicy(policy: ChatExecutionPolicy) {
    this.executionPolicy = policy;
  }
  workflowPersistence() {
    return this.store.runs;
  }
  executing(runId: string) {
    return (
      this.store.forRun(runId).busy() ||
      DEBATE_SEATS.some(
        (seat) =>
          this.active.has(this.key(seat, runId)) ||
          this.humanWaiters.has(this.key(seat, runId)) ||
          this.messagePumps.has(this.key(seat, runId)),
      )
    );
  }
  busy(runId: string) {
    return this.store.messaging.pending(runId) || this.executing(runId);
  }
  reapproveQueued(runId: string) {
    const run = this.run(runId);
    for (const seat of DEBATE_SEATS)
      this.store.messaging.reapprove(
        runId,
        seat,
        this.store.runs.binding(runId, seat).id,
        run.revision,
      );
  }
  publishEvent(runId: string, kind: string, payload: Record<string, unknown>) {
    this.store.runs.append(runId, kind, null, null, payload);
  }
  refreshRun(runId: string) {
    this.emitBoth(runId);
  }
  hangout() {
    return this.store.runs.ensureHangout();
  }
  hangoutProject() {
    return { path: this.store.hangoutProject()?.path ?? null };
  }
  setHangoutProject(body: unknown) {
    if (!body || typeof body !== 'object' || !('path' in body) || Object.keys(body).length !== 1)
      throw new BadRequestException('Provide the absolute project path.');
    return this.changeHangoutProject(bindHangoutProject(body.path));
  }
  detachHangoutProject() {
    return this.changeHangoutProject(null);
  }
  private changeHangoutProject(project: ReturnType<typeof bindHangoutProject> | null) {
    this.hangout();
    if (this.busy(HANGOUT_ID) || this.store.side.busy(HANGOUT_ID) || this.projectCalls)
      throw new ConflictException(
        'Wait for active and queued conversations to finish before changing the project.',
      );
    this.store.setHangoutProject(project);
    return this.hangoutProject();
  }
  hangoutPresence() {
    this.hangout();
    return {
      a: this.store.presence.get(this.store.runs.binding(HANGOUT_ID, 'a')),
      b: this.store.presence.get(this.store.runs.binding(HANGOUT_ID, 'b')),
    };
  }
  inviteHangout(seat: AgentId) {
    this.hangout();
    const binding = this.store.runs.binding(HANGOUT_ID, seat);
    if (!this.store.presence.isPresent(binding))
      this.store.forRun(HANGOUT_ID).updateHangoutPresence(binding, { present: true });
    return this.hangoutPresence();
  }
  requirePresent(binding: ParticipantBinding) {
    if (!this.store.presence.isPresent(binding))
      throw new ConflictException('This participant is away from the hangout.');
  }
  async searchHangoutMemory(body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      !('query' in body) ||
      typeof body.query !== 'string' ||
      !body.query.trim() ||
      body.query.trim().length > 500 ||
      !('conversation' in body) ||
      !['room', 'a', 'b'].includes(String(body.conversation))
    )
      throw new BadRequestException(
        'Choose a conversation and enter a search of 1–500 characters.',
      );
    const memory = this.store.runs.memory;
    if (!memory) throw new ServiceUnavailableException('Room memory is off.');
    try {
      const records =
        body.conversation === 'room'
          ? await recallRoomMessages(memory.client, body.query, [HANGOUT_ID])
          : await memory.recallWhisper(
              this.store.runs.binding(HANGOUT_ID, body.conversation as AgentId),
              body.query,
            );
      return JSON.parse(records);
    } catch {
      throw new ServiceUnavailableException('Memory search is unavailable. Try again shortly.');
    }
  }
  hangoutMemoryStatus() {
    return this.store.runs.memory?.status() ?? { enabled: false };
  }
  currentRun() {
    return this.store.runs.current();
  }
  listRuns() {
    return { runs: this.store.runs.list(), currentRunId: this.store.runs.currentId() };
  }
  run(id: string) {
    return this.store.runs.get(id);
  }
  createRun() {
    return this.store.runs.create();
  }
  async cloneRun(id: string, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      !('requestId' in body) ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(body.requestId) ||
      !('expectedRevision' in body) ||
      typeof body.expectedRevision !== 'number' ||
      !Number.isSafeInteger(body.expectedRevision) ||
      !('sourceChoice' in body) ||
      (body.sourceChoice !== 'saved' && body.sourceChoice !== 'head')
    )
      throw new BadRequestException('Provide a request ID, source revision, and source choice.');
    const previous = this.store.runs.cloneReceipt(
      body.requestId,
      id,
      body.expectedRevision,
      body.sourceChoice,
    );
    if (previous) return previous;
    const source = this.store.runs.get(id);
    if (source.revision !== body.expectedRevision)
      throw new ConflictException('The source setup changed. Review it again.');
    for (const role of DEBATE_SEATS) {
      const selected = source.seats[role];
      const catalog = await this.catalogReader(selected.provider);
      if (
        catalog.status !== 'ready' ||
        !catalog.models.some(
          (model) => model.id === selected.model && model.efforts.includes(selected.effort),
        )
      )
        throw new BadRequestException(
          catalog.reason ??
            'The selected model or effort is unavailable on the signed-in subscription.',
        );
    }
    return this.store.runs.cloneSetup(body.requestId, id, body.expectedRevision, body.sourceChoice);
  }
  selectRun(id: string) {
    if (
      this.active.size ||
      [...this.store.runs.list()].some((run) => this.busy(run.id) || this.sideService?.busy(run.id))
    )
      throw new ConflictException('Stop active and queued work before changing the current run.');
    return this.store.runs.select(id);
  }
  correspondence(id: string, after = 0, limit = 100) {
    const events = this.store.runs.correspondence(id, after, limit);
    return { events, cursor: events.at(-1)?.seq ?? after, through: this.store.runs.cursor(id) };
  }
  correspondenceEvents(id: string, after = 0) {
    this.store.runs.correspondence(id, after, 1);
    return new Observable<{ id: string; data: unknown }>((subscriber) => {
      let cursor = after;
      const send = () => {
        const through = this.store.runs.cursor(id);
        while (cursor < through && !subscriber.closed) {
          const rows = this.store.runs
            .correspondence(id, cursor, 500)
            .filter((row) => row.seq <= through);
          if (!rows.length) break;
          for (const row of rows) {
            if (subscriber.closed) break;
            cursor = row.seq;
            subscriber.next({ id: String(row.seq), data: row });
          }
        }
      };
      const unsubscribe = this.committed((runId) => {
        if (runId === id) send();
      });
      send();
      return unsubscribe;
    });
  }
  providerCatalog(value: string) {
    if (value !== 'codex' && value !== 'anthropic')
      throw new NotFoundException('Unknown provider.');
    return this.catalogReader(value);
  }
  async configureRun(id: string, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      !('expectedRevision' in body) ||
      !('seats' in body) ||
      typeof body.expectedRevision !== 'number' ||
      !Number.isSafeInteger(body.expectedRevision) ||
      !body.seats ||
      typeof body.seats !== 'object' ||
      !('a' in body.seats) ||
      !('b' in body.seats)
    )
      throw new BadRequestException(
        'Provide the reviewed expectedRevision and both seat configurations.',
      );
    const seats = { a: parseProviderConfig(body.seats.a), b: parseProviderConfig(body.seats.b) };
    for (const role of DEBATE_SEATS) {
      const selected = seats[role];
      const catalog = await this.catalogReader(selected.provider);
      const model = catalog.models.find((candidate) => candidate.id === selected.model);
      if (catalog.status !== 'ready' || !model || !model.efforts.includes(selected.effort))
        throw new BadRequestException(
          catalog.reason ??
            'The selected model or effort is unavailable on the signed-in subscription.',
        );
    }
    const run = this.store.runs.configure(
      id,
      body.expectedRevision,
      seats,
      () =>
        this.busy(id) ||
        this.sideService?.busy(id) ||
        DEBATE_SEATS.some(
          (role) =>
            this.active.has(this.key(role, id)) || this.humanWaiters.has(this.key(role, id)),
        ),
    );
    this.emitBoth(id);
    return run;
  }
  list(runId = this.store.runs.currentId()) {
    const run = this.store.runs.get(runId);
    return {
      runId,
      revision: run.revision,
      agents: DEBATE_SEATS.map((role) => this.runtime(this.store.runs.binding(runId, role)).info),
    };
  }
  snapshot(agent: AgentId, runId = this.store.runs.currentId()) {
    const now = Date.now();
    return {
      ...this.store.forRun(runId).snapshot(agent),
      ...(runId === HANGOUT_ID
        ? { hangoutPresence: this.store.presence.get(this.store.runs.binding(runId, agent)) }
        : {}),
      expression: this.expressions(runId).snapshot(agent, now),
      serverNow: now,
    };
  }
  speechSegment(reference: SpeechReference): string {
    if (reference.runId !== HANGOUT_ID && reference.runId !== this.store.runs.currentId())
      throw new ConflictException('Speech belongs to another run.');
    const reply = this.store
      .forRun(reference.runId)
      .snapshot(reference.agent)
      .messages.find((message) => message.id === reference.replyId);
    if (!reply || reply.status !== 'completed')
      throw new ConflictException('Only completed replies can be spoken.');
    const narration = reply.narration;
    if (!narration || narration.status !== 'ready')
      throw new ConflictException(
        narration?.status === 'unavailable' ? narration.reason : 'No spoken summary is available.',
      );
    if (
      narration.revision !== reference.revision ||
      narration.segments[reference.segment] === undefined
    )
      throw new ConflictException('The narration reference is stale or invalid.');
    return narration.segments[reference.segment];
  }
  events(agent: AgentId, runId = this.store.runs.currentId()): Observable<{ data: ChatSnapshot }> {
    this.store.runs.get(runId);
    return new Observable((subscriber) => {
      const send = (data: ChatSnapshot) => subscriber.next({ data });
      const key = this.key(agent, runId);
      const listeners = this.listeners.get(key) ?? new Set();
      this.listeners.set(key, listeners);
      listeners.add(send);
      send(this.snapshot(agent, runId));
      const heartbeat = setInterval(() => send(this.snapshot(agent, runId)), 15000);
      return () => {
        clearInterval(heartbeat);
        listeners.delete(send);
      };
    });
  }
  private emit(agent: AgentId, runId = this.store.runs.currentId()) {
    const snapshot = this.snapshot(agent, runId);
    this.listeners.get(this.key(agent, runId))?.forEach((send) => send(snapshot));
  }
  submit(agent: AgentId, body: unknown, runId = this.store.runs.currentId()) {
    if (runId === HANGOUT_ID)
      throw new BadRequestException('Use Both for the room or open a whisper to one person.');
    return this.submitInternal(agent, body, runId, 'human');
  }
  submitWorkflow(agent: AgentId, body: unknown, runId: string) {
    return this.submitInternal(agent, body, runId, 'workflow');
  }
  private async submitInternal(
    agent: AgentId,
    body: unknown,
    runId = this.store.runs.currentId(),
    source: 'human' | 'workflow' = 'human',
  ): Promise<{ turnId: string }> {
    const requestedAt = Date.now();
    const store = this.store.forRun(runId);
    const key = this.key(agent, runId);
    if (
      !body ||
      typeof body !== 'object' ||
      !('text' in body) ||
      !('requestId' in body) ||
      typeof body.text !== 'string' ||
      typeof body.requestId !== 'string' ||
      !body.text.trim() ||
      body.text.length > 16000 ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(body.requestId)
    )
      throw new BadRequestException(
        'Provide text (1–16000 characters) and a stable requestId (8–128 letters, digits, underscores or hyphens).',
      );
    if ('runId' in body && body.runId !== runId)
      throw new ConflictException('This request belongs to another run.');
    if (
      'expectedRevision' in body &&
      (typeof body.expectedRevision !== 'number' || !Number.isSafeInteger(body.expectedRevision))
    )
      throw new BadRequestException('expectedRevision must be an integer.');
    const expectedRevision = 'expectedRevision' in body ? Number(body.expectedRevision) : undefined;
    const text = body.text.trim();
    const requestId = body.requestId;
    const duplicate = () => {
      const existing = store.find(agent, requestId);
      if (!existing) return undefined;
      if (existing.prompt !== text)
        throw new ConflictException('This requestId was already used for different text.');
      return { turnId: existing.id };
    };
    const existing = duplicate();
    if (existing) return existing;
    this.requirePresent(this.store.runs.binding(runId, agent));
    this.executionPolicy?.submit(runId, source);
    if (expectedRevision !== undefined && expectedRevision !== this.store.runs.get(runId).revision)
      throw new ConflictException('The run configuration changed. Review the latest revision.');
    const runtime = this.runtime(this.store.runs.binding(runId, agent));
    if (runtime.info.status === 'unavailable')
      throw new ServiceUnavailableException(runtime.info.reason);
    if (this.destroyed) throw new ServiceUnavailableException('The room is shutting down.');
    const epoch = this.stopEpochs.get(runId) ?? 0;
    const seatEpoch = this.seatStopEpochs.get(key) ?? 0;
    this.humanWaiters.set(key, (this.humanWaiters.get(key) ?? 0) + 1);
    try {
      const active = this.active.get(key);
      if (active && !active.turn.from_panelist)
        throw new ConflictException(
          'This agent is already replying. Stop or wait before sending another message.',
        );
      if (active) {
        store.cancelConversation(active.turn.conversation_id, 'Sid took the next turn.');
        active.controller.abort();
        this.emitBoth(runId);
        await active.promise;
      }
      if (
        this.destroyed ||
        epoch !== (this.stopEpochs.get(runId) ?? 0) ||
        seatEpoch !== (this.seatStopEpochs.get(key) ?? 0)
      )
        throw new ConflictException(
          'The conversation stopped. Send your message again to continue.',
        );
      this.requirePresent(this.store.runs.binding(runId, agent));
      const retried = duplicate();
      if (retried) return retried;
      if (this.active.has(key))
        throw new ConflictException(
          'This agent is already replying. Stop or wait before sending another message.',
        );
      const id = randomUUID();
      store.create(id, agent, requestId, text, expectedRevision, source, requestedAt);
      this.startTurn(store.turn(id));
      return { turnId: id };
    } finally {
      const waiting = (this.humanWaiters.get(key) ?? 1) - 1;
      if (waiting) this.humanWaiters.set(key, waiting);
      else this.humanWaiters.delete(key);
      this.scheduleDrain(runId);
    }
  }
  private emitBoth(runId = this.store.runs.currentId()) {
    for (const agent of PANELISTS) this.emit(agent, runId);
  }
  private scheduleDrain(requestedRunId = this.store.runs.currentId()) {
    if (this.destroyed || !this.initialized) return;
    this.drainRuns.add(requestedRunId);
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      if (this.destroyed) return;
      const runs = [...this.drainRuns];
      this.drainRuns.clear();
      for (const runId of runs) {
        const run = this.run(runId);
        for (const agent of PANELISTS) void this.drainMessages(run.id, agent);
        const store = this.store.forRun(run.id);
        if (this.executionPolicy && !this.executionPolicy.drain(run.id)) continue;
        for (const agent of PANELISTS) {
          const key = this.key(agent, run.id);
          if (
            this.active.has(key) ||
            this.humanWaiters.has(key) ||
            this.store.messaging.pending(run.id, agent)
          )
            continue;
          const delivery = store.nextDelivery(agent);
          if (!delivery) continue;
          if (!this.store.presence.isPresent(this.store.runs.binding(run.id, agent))) {
            store.failDelivery(delivery.id, 'The recipient left the hangout.');
            continue;
          }
          const runtime = this.runtime(this.store.runs.binding(run.id, agent));
          if (runtime.info.status === 'unavailable') {
            store.failDelivery(
              delivery.id,
              runtime.info.reason ?? 'Recipient provider unavailable.',
            );
            this.emitBoth(run.id);
            this.scheduleDrain(run.id);
            continue;
          }
          const turn = store.claimDelivery(delivery);
          if (turn) this.startTurn(turn);
        }
      }
    });
  }
  submitMessage(agent: AgentId, body: unknown, runId: string): MessageReceipt {
    if (
      !body ||
      typeof body !== 'object' ||
      !('text' in body) ||
      typeof body.text !== 'string' ||
      !body.text.trim() ||
      body.text.length > 16000 ||
      !('requestId' in body) ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(body.requestId) ||
      !('expectedRevision' in body) ||
      typeof body.expectedRevision !== 'number' ||
      !Number.isSafeInteger(body.expectedRevision) ||
      !('intent' in body) ||
      !MESSAGE_INTENTS.some((value) => value === body.intent)
    )
      throw new BadRequestException(
        'Provide text, requestId, expectedRevision and a valid delivery intent.',
      );
    const broadcastId = 'broadcastId' in body ? body.broadcastId : undefined;
    if (
      broadcastId !== undefined &&
      (typeof broadcastId !== 'string' ||
        !broadcastId ||
        body.requestId !== `${broadcastId}-${agent}`)
    )
      throw new BadRequestException('The broadcast ID must match this seat’s request ID.');
    if (runId === HANGOUT_ID && !broadcastId)
      throw new BadRequestException('Use Both for the room or open a whisper to one person.');
    const intent = body.intent;
    if (intent !== 'send' && intent !== 'queue' && intent !== 'interrupt')
      throw new BadRequestException('Invalid delivery intent.');
    const run = this.run(runId),
      binding = this.store.runs.binding(runId, agent);
    const existing = this.store.messaging.find(runId, agent, body.requestId);
    if (existing) {
      if (
        existing.text !== body.text.trim() ||
        existing.intent !== intent ||
        existing.bindingId !== binding.id ||
        existing.revision !== body.expectedRevision
      )
        throw new ConflictException(
          'This requestId was already used for different content, intent, or scope.',
        );
      return existing;
    }
    if (this.destroyed) throw new ServiceUnavailableException('The room is shutting down.');
    this.requirePresent(binding);
    if (run.state === 'retained' || run.revision !== body.expectedRevision)
      throw new ConflictException('The run configuration changed or is read-only.');
    this.executionPolicy?.intervention?.(runId, agent, intent);
    if (
      intent === 'send' &&
      (this.active.has(this.key(agent, runId)) || this.store.messaging.pending(runId, agent))
    )
      throw new ConflictException('This seat is working. Choose Queue or Interrupt and send.');
    if (
      this.store.messaging
        .list(runId, agent)
        .filter((message) =>
          ['queued', 'dispatching', 'running'].includes(message.status),
        ).length >= 64
    )
      throw new ConflictException(
        'This seat has 64 pending messages. Cancel or finish some before adding more.',
      );
    const runtime = this.runtime(binding);
    if (runtime.info.status === 'unavailable')
      throw new ServiceUnavailableException(runtime.info.reason);
    const result = this.store.messaging.create(
      {
        runId,
        seat: agent,
        bindingId: binding.id,
        revision: run.revision,
        requestId: body.requestId,
        text: body.text.trim(),
        intent,
      },
      broadcastId,
    );
    this.emit(agent, runId);
    this.scheduleDrain(runId);
    return result;
  }
  cancelMessage(agent: AgentId, runId: string, id: string) {
    const result = this.store.messaging.cancel(id, runId, agent);
    this.emit(agent, runId);
    this.scheduleDrain(runId);
    return result;
  }
  private async drainMessages(runId: string, agent: AgentId) {
    const key = this.key(agent, runId);
    if (
      this.destroyed ||
      this.messagePumps.has(key) ||
      this.executionPolicy?.messageDrain?.(runId) === false
    )
      return;
    const message = this.store.messaging.next(runId, agent);
    if (!message) return;
    const active = this.active.get(key);
    // Sid's words reach a reply in progress when the runtime can read them
    // mid-turn. Otherwise a non-interrupt message waits for the reply to end.
    const followUp = Boolean(active) && message.intent !== 'interrupt';
    if (followUp && (!active?.inbox || active.inbox.isClosed)) return;
    this.messagePumps.add(key);
    const epoch = this.stopEpochs.get(runId) ?? 0;
    const seatEpoch = this.seatStopEpochs.get(key) ?? 0;
    try {
      const binding = this.store.runs.binding(runId, agent);
      this.requirePresent(binding);
      if (
        binding.id !== message.bindingId ||
        this.run(runId).revision !== this.store.messaging.dispatchRevision(message.id)
      )
        throw new ConflictException('The saved message belongs to an earlier configuration.');
      this.executionPolicy?.intervention?.(runId, agent, message.intent);
      if (followUp && active?.inbox) {
        const turnId = active.turn.id;
        this.store.messaging.update(message, 'running', { turnId });
        this.store.runs.append(runId, 'human.prompt', agent, turnId, {
          text: message.text,
          requestId: message.requestId,
          trigger: 'follow-up',
          bindingId: binding.id,
          revision: this.store.messaging.dispatchRevision(message.id),
        });
        if (!active.inbox.push(`Sid’s follow-up, sent while you were replying:\n${message.text}`)) {
          // The reply ended between the check and the push; let the normal path take it.
          this.store.messaging.update(message, 'queued');
          this.scheduleDrain(runId);
        }
        return;
      }
      this.store.messaging.update(message, 'dispatching');
      if (active) {
        this.store
          .forRun(runId)
          .cancelConversation(active.turn.conversation_id, 'Sid interrupted this reply.');
        active.controller.abort();
        await active.promise;
      }
      const current = this.store.messaging.get(message.id, runId, agent);
      if (
        this.destroyed ||
        epoch !== (this.stopEpochs.get(runId) ?? 0) ||
        seatEpoch !== (this.seatStopEpochs.get(key) ?? 0) ||
        current.status === 'cancelled'
      ) {
        if (current.status !== 'cancelled') this.store.messaging.update(message, 'cancelled');
        return;
      }
      this.requirePresent(binding);
      if (this.active.has(key))
        throw new ConflictException('Another reply started before delivery.');
      const id = randomUUID();
      this.store
        .forRun(runId)
        .create(
          id,
          agent,
          message.requestId,
          message.text,
          this.store.messaging.dispatchRevision(message.id),
          'intervention',
          message.createdAt,
        );
      this.store.messaging.update(message, 'running', { turnId: id });
      this.startTurn(this.store.forRun(runId).turn(id));
    } catch (error) {
      if (this.store.messaging.get(message.id, runId, agent).status !== 'cancelled')
        this.store.messaging.update(message, 'failed', {
          error: error instanceof Error ? error.message : 'Message delivery failed.',
        });
    } finally {
      this.messagePumps.delete(key);
      this.emit(agent, runId);
    }
  }
  private startTurn(turn: TurnRow) {
    const { id, agent } = turn;
    const store = this.store.forRun(turn.run_id);
    const binding = this.store.runs.bindingById(turn.binding_id);
    const runtime = this.runtime(binding);
    const key = this.key(agent, turn.run_id);
    const controller = new AbortController();
    const policy = this.executionPolicy;
    policy?.started(
      turn.run_id,
      agent,
      id,
      Boolean(this.store.messaging.find(turn.run_id, agent, turn.request)),
    );
    const additions = policy?.definitions(binding);
    const hangout = turn.run_id === HANGOUT_ID;
    const requiredToolVersion = hangout ? HANGOUT_TOOL_VERSION : ROOM_TOOL_VERSION;
    const project = hangout ? this.store.hangoutProject() : null;
    const projectDefinitions = hangout ? this.projectTools.definitions() : [];
    let handledProject = false;
    let handledWhisper = false;
    const definitions =
      additions || hangout
        ? [
            ...new Map(
              [
                ...runtimeTools(binding.role),
                ...(additions ?? []),
                ...(hangout
                  ? [
                      ...hangoutParticipationTools,
                      recallTool,
                      whisperPeerTool,
                      ...projectDefinitions,
                    ]
                  : []),
              ].map((tool) => [tool.name, tool]),
            ).values(),
          ]
        : undefined;
    // Only the Anthropic runtime reads input mid-turn today. Codex seats keep
    // the inbox undefined so their follow-ups wait for the reply to end.
    const inbox = binding.config.provider === 'anthropic' ? new FollowUps() : undefined;
    const promise = Promise.resolve().then(async () => {
      const started = performance.now();
      try {
        this.store.runs.state.started(id);
        controller.signal.throwIfAborted();
        const savedSession = this.store.runs.session(binding.id)?.continuation;
        const savedToolVersion = this.store.runs.session(binding.id)?.toolVersion ?? 0;
        await runtime.run({
          inbox,
          text: store.publicTurnPrompt(turn),
          tools: definitions,
          instructions: hangout
            ? hangoutInstructions(
                agent,
                modelName(binding.config.model),
                modelName(
                  this.store.runs.binding(turn.run_id, agent === 'a' ? 'b' : 'a').config.model,
                ),
                Boolean(this.store.runs.memory),
                project?.path ?? null,
              )
            : undefined,
          refreshInstructions: hangout,
          session: savedSession,
          toolVersion: savedToolVersion,
          requiredToolVersion,
          priorHistory:
            binding.config.provider === 'codex' &&
            savedSession &&
            savedToolVersion < requiredToolVersion
              ? store.history(agent)
              : undefined,
          controller,
          usage: (observation) => this.store.runs.state.usage(id, observation),
          usageBaseline: savedSession
            ? this.store.runs.state.baseline(binding.id, savedSession)
            : undefined,
          saveUsageBaseline: (continuation, tokens) =>
            this.store.runs.state.saveBaseline(binding.id, continuation, tokens),
          append: (chunk) => {
            if (!controller.signal.aborted) {
              if (chunk) this.store.runs.state.firstText(id);
              store.append(id, chunk);
              this.emit(agent, turn.run_id);
            }
          },
          saveSession: (session, toolVersion) => {
            if (
              controller.signal.aborted ||
              this.active.get(key)?.turn.id !== id ||
              store.turn(id).status !== 'streaming'
            )
              return;
            store.saveTurnSession(id, session, toolVersion);
            this.emit(agent, turn.run_id);
          },
          tool: async (name, input) => {
            controller.signal.throwIfAborted();
            if (name === whisperPeerTool.name) handledWhisper = true;
            if (hangout) this.requirePresent(binding);
            if (name.startsWith('project_')) {
              if (
                this.active.get(key)?.turn.id !== id ||
                !projectDefinitions.some((tool) => tool.name === name)
              )
                throw new Error('This project tool is unavailable.');
              handledProject = true;
              const root = verifyHangoutProject(project);
              this.projectCalls++;
              try {
                return await this.projectTools.call(root, name, input, controller.signal);
              } finally {
                this.projectCalls--;
              }
            }
            // Private arguments, results and failures must bypass shared tool telemetry.
            if (name === whisperPeerTool.name) {
              if (
                !hangout ||
                this.active.get(key)?.turn.id !== id ||
                Object.keys(input).length !== 1 ||
                typeof input.text !== 'string'
              )
                throw new Error('Invalid private whisper.');
              const recipient = this.store.runs.binding(HANGOUT_ID, agent === 'a' ? 'b' : 'a');
              this.requirePresent(recipient);
              this.peerWhispers ??= this.store.createPeerWhispers(
                this.runtimeFactory,
                this.workspace,
              );
              return this.peerWhispers.send(binding, recipient, id, input.text, controller.signal);
            }
            const toolId = this.store.runs.state.startTool(id, name);
            const toolStarted = performance.now();
            try {
              let output: string;
              const handled = await policy?.call(binding, id, name, input, controller.signal);
              if (handled !== undefined) {
                output = handled;
              } else if (
                name === 'summarize_speech' &&
                Object.keys(input).length === 1 &&
                typeof input.text === 'string' &&
                input.text.trim() &&
                input.text.length <= 16000
              ) {
                output =
                  hangout && !this.store.presence.get(binding).voiceEnabled
                    ? 'Your voice is off.'
                    : 'Spoken summary recorded.';
              } else if (
                hangout &&
                name === 'set_voice' &&
                typeof input.enabled === 'boolean' &&
                Object.keys(input).length === 1
              ) {
                store.updateHangoutPresence(binding, { voiceEnabled: input.enabled });
                output = input.enabled ? 'Your voice is on.' : 'Your voice is off.';
              } else if (hangout && name === 'leave_room' && Object.keys(input).length === 0) {
                store.updateHangoutPresence(binding, { present: false });
                this.peerWhispers?.stop(binding);
                await this.sideService?.stop(HANGOUT_ID, agent);
                output = 'You have left the hangout. Sid can invite you back.';
              } else if (hangout && name === 'recall_room') {
                if (typeof input.query !== 'string' || Object.keys(input).length !== 1)
                  throw new BadRequestException('Provide a search query.');
                const memory = this.store.runs.memory;
                if (!memory) throw new Error('Room memory is off.');
                output = await recallRoomMessages(memory.client, input.query, [HANGOUT_ID]);
              } else if (name === 'address_panelist') {
                if (
                  Object.keys(input).length !== 1 ||
                  (input.recipient !== 'a' && input.recipient !== 'b') ||
                  input.recipient === agent
                )
                  throw new BadRequestException('Provide only the other panelist recipient.');
                if (hangout)
                  this.requirePresent(this.store.runs.binding(HANGOUT_ID, input.recipient));
                policy?.address(turn.run_id, id);
                output = JSON.stringify(store.address(id, input.recipient));
                this.emit(agent, turn.run_id);
              } else if (
                name === 'face_panel' &&
                Object.keys(input).length === 1 &&
                PANEL_TARGETS.includes(input.target as PanelTarget)
              ) {
                const pose = panelPose(agent, input.target as PanelTarget);
                store.setPose(agent, pose);
                output = `Panel turned toward ${String(input.target)} (${pose}). This choice takes over from any manual adjustment.`;
                this.emit(agent, turn.run_id);
              } else if (
                name === 'set_pose' &&
                Object.keys(input).length === 1 &&
                typeof input.pose === 'string' &&
                ['front', 'left', 'right'].includes(input.pose)
              ) {
                store.setPose(agent, input.pose as Pose);
                output = `Panel pose set to ${String(input.pose)}. This choice takes over from any manual adjustment.`;
                this.emit(agent, turn.run_id);
              } else if (name === 'express') {
                output = JSON.stringify(this.expressions(turn.run_id).express(agent, input));
              } else if (name === 'clear_expression') {
                output = JSON.stringify(this.expressions(turn.run_id).clear(agent, input));
              } else if (name === 'list_workspace' && Object.keys(input).length === 0) {
                const entries = await readdir(this.workspace, { withFileTypes: true });
                output = entries
                  .filter((entry) => !entry.name.startsWith('.'))
                  .slice(0, 100)
                  .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
                  .join('\n');
              } else throw new Error('Tool request is outside the permitted room tools.');
              store.tool(id, name, input, output);
              this.store.runs.state.finishTool(
                toolId,
                'succeeded',
                performance.now() - toolStarted,
              );
              return output;
            } catch (error) {
              this.store.runs.state.finishTool(
                toolId,
                controller.signal.aborted ? 'interrupted' : 'failed',
                performance.now() - toolStarted,
              );
              store.runs.append(turn.run_id, 'tool.failed', agent, id, {
                name,
                input: JSON.stringify(input).slice(0, 16000),
                error: (error instanceof Error ? error.message : 'Tool execution failed.').slice(
                  0,
                  2000,
                ),
              });
              throw error;
            }
          },
        });
        store.finish(
          id,
          controller.signal.aborted ? 'stopped' : 'completed',
          performance.now() - started,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          store.finish(id, 'stopped', performance.now() - started);
          if (error instanceof UnconfirmedCancellationError) {
            const receipt = this.store.messaging.find(turn.run_id, agent, turn.request);
            if (receipt)
              this.store.messaging.update(receipt, 'uncertain', { error: error.message });
          }
        } else {
          // Provider diagnostics can echo a private tool payload.
          const message = handledWhisper
            ? 'The agent connection failed during a private exchange.'
            : handledProject
              ? 'The agent connection failed during project work.'
              : error instanceof Error
                ? error.message
                : 'The agent connection failed.';
          store.finish(id, 'failed', performance.now() - started);
          store.setError(agent, message);
          if (/auth|unauthorized|api.key|login|401|403|model.*(not|unavailable)/i.test(message)) {
            runtime.info.status = 'unavailable';
            runtime.info.reason = message;
          }
        }
      } finally {
        inbox?.close();
        this.active.delete(key);
        this.emitBoth(turn.run_id);
        this.scheduleDrain(turn.run_id);
      }
    });
    this.active.set(key, { controller, promise, turn, inbox });
    this.emitBoth(turn.run_id);
  }
  async stop(agent: AgentId, runId = this.store.runs.currentId()) {
    if (runId === HANGOUT_ID) this.peerWhispers?.stop(this.store.runs.binding(runId, agent));
    const key = this.key(agent, runId);
    this.seatStopEpochs.set(key, (this.seatStopEpochs.get(key) ?? 0) + 1);
    this.store.messaging.cancelPending(runId, agent);
    const active = this.active.get(this.key(agent, runId));
    if (active) {
      this.store
        .forRun(runId)
        .cancelConversation(active.turn.conversation_id, 'Conversation stopped.');
      active.controller.abort();
      await active.promise;
    }
    this.emitBoth(runId);
    return this.snapshot(agent, runId);
  }
  pauseDispatch(runId: string) {
    this.store
      .forRun(runId)
      .cancelAllConversations('Paused at a safe boundary. Queued handoffs were cancelled.');
  }
  async stopConversation(runId = this.store.runs.currentId()) {
    if (!this.destroyed) this.executionPolicy?.stopped(runId);
    this.stopEpochs.set(runId, (this.stopEpochs.get(runId) ?? 0) + 1);
    this.store.messaging.cancelPending(runId);
    const sideStopped = this.sideService?.stopRun(runId);
    this.store.forRun(runId).cancelAllConversations('Conversation stopped by Sid.');
    const active = [...this.active.values()].filter((turn) => turn.turn.run_id === runId);
    active.forEach((turn) => turn.controller.abort());
    await Promise.allSettled([
      ...active.map((turn) => turn.promise),
      ...(sideStopped ? [sideStopped] : []),
    ]);
    this.emitBoth(runId);
    return { stopped: true };
  }
  async onModuleDestroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeCommits?.();
    await this.sideService?.close();
    const active = [...this.active.values()];
    active.forEach((turn) => turn.controller.abort());
    await Promise.allSettled(active.map((turn) => turn.promise));
    for (const expressions of this.expressionRuns.values()) expressions.close();
    await this.store.runs.memory?.close();
    this.store.close();
  }
}
