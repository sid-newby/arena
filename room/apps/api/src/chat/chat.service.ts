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
import { PANEL_TARGETS, ROOM_TOOL_VERSION, panelPose, type PanelTarget } from './panel-presence.js';
import { PANELISTS } from './panelist-delivery.js';
import { runtimeTools } from './runtime-tools.js';
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
    { controller: AbortController; promise: Promise<void>; turn: TurnRow }
  >();
  private readonly humanWaiters = new Map<string, number>();
  private drainTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private readonly stopEpochs = new Map<string, number>();
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
    this.store = new ChatStore(
      process.env.ROOM_DB_PATH ?? resolve(this.workspace, '.room/chat.sqlite'),
      this.workspace,
    );
  }
  static forTest(
    store: ChatStore,
    runtimes: Record<AgentId, AgentRuntime>,
    workspace: string,
    options: {
      catalogReader?: (provider: ProviderId) => Promise<ProviderCatalog>;
      runtimeFactory?: (binding: ParticipantBinding) => AgentRuntime;
    } = {},
  ): ChatService {
    const service = Object.assign(Object.create(ChatService.prototype), {
      store,
      workspace,
      active: new Map(),
      humanWaiters: new Map(),
      destroyed: false,
      stopEpochs: new Map(),
      listeners: new Map(),
      expressionRuns: new Map(),
      runtimeCache: new Map(),
      runtimeFactory:
        options.runtimeFactory ??
        ((binding: ParticipantBinding) => runtimes[binding.role === 'b' ? 'b' : 'a']),
      catalogReader: options.catalogReader ?? discoverModels,
    }) as ChatService;
    return service;
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
  busy(runId: string) {
    return (
      this.store.forRun(runId).busy() ||
      DEBATE_SEATS.some(
        (seat) =>
          this.active.has(this.key(seat, runId)) || this.humanWaiters.has(this.key(seat, runId)),
      )
    );
  }
  publishEvent(runId: string, kind: string, payload: Record<string, unknown>) {
    this.store.runs.append(runId, kind, null, null, payload);
  }
  refreshRun(runId: string) {
    this.emitBoth(runId);
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
      [...this.store.runs.list()].some((run) => this.store.forRun(run.id).busy())
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
        const rows = this.store.runs.correspondence(id, cursor, 500);
        for (const row of rows) {
          subscriber.next({ id: String(row.seq), data: row });
          cursor = row.seq;
        }
      };
      send();
      const timer = setInterval(send, 250);
      return () => clearInterval(timer);
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
        this.store.forRun(id).busy() ||
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
      expression: this.expressions(runId).snapshot(agent, now),
      serverNow: now,
    };
  }
  speechSegment(reference: SpeechReference): string {
    if (reference.runId !== this.store.runs.currentId())
      throw new ConflictException('Speech belongs to another run.');
    const reply = this.store
      .forRun(reference.runId)
      .snapshot(reference.agent)
      .messages.find((message) => message.id === reference.replyId);
    if (!reply || reply.status !== 'completed')
      throw new ConflictException('Only completed replies can be spoken.');
    const narration = reply.narration;
    if (!narration || narration.status !== 'ready')
      throw new ConflictException(narration?.reason ?? 'No spoken summary is available.');
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
    this.executionPolicy?.submit(runId, source);
    if (expectedRevision !== undefined && expectedRevision !== this.store.runs.get(runId).revision)
      throw new ConflictException('The run configuration changed. Review the latest revision.');
    const runtime = this.runtime(this.store.runs.binding(runId, agent));
    if (runtime.info.status === 'unavailable')
      throw new ServiceUnavailableException(runtime.info.reason);
    if (this.destroyed) throw new ServiceUnavailableException('The room is shutting down.');
    const epoch = this.stopEpochs.get(runId) ?? 0;
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
      if (this.destroyed || epoch !== (this.stopEpochs.get(runId) ?? 0))
        throw new ConflictException(
          'The conversation stopped. Send your message again to continue.',
        );
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
      this.scheduleDrain();
    }
  }
  private emitBoth(runId = this.store.runs.currentId()) {
    for (const agent of PANELISTS) this.emit(agent, runId);
  }
  private scheduleDrain() {
    if (this.destroyed || this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined;
      for (const run of this.store.runs.list()) {
        const store = this.store.forRun(run.id);
        if (this.executionPolicy && !this.executionPolicy.drain(run.id)) continue;
        for (const agent of PANELISTS) {
          const key = this.key(agent, run.id);
          if (this.active.has(key) || this.humanWaiters.has(key)) continue;
          const delivery = store.nextDelivery(agent);
          if (!delivery) continue;
          const runtime = this.runtime(this.store.runs.binding(run.id, agent));
          if (runtime.info.status === 'unavailable') {
            store.failDelivery(
              delivery.id,
              runtime.info.reason ?? 'Recipient provider unavailable.',
            );
            this.emitBoth(run.id);
            this.scheduleDrain();
            continue;
          }
          const turn = store.claimDelivery(delivery);
          if (turn) this.startTurn(turn);
        }
      }
    }, 200);
    this.drainTimer.unref();
  }
  private startTurn(turn: TurnRow) {
    const { id, agent, prompt: text } = turn;
    const store = this.store.forRun(turn.run_id);
    const binding = this.store.runs.bindingById(turn.binding_id);
    const runtime = this.runtime(binding);
    const key = this.key(agent, turn.run_id);
    const controller = new AbortController();
    const policy = this.executionPolicy;
    policy?.started(turn.run_id, agent, id);
    const additions = policy?.definitions(binding);
    const definitions = additions
      ? [
          ...new Map(
            [...runtimeTools(binding.role), ...additions].map((tool) => [tool.name, tool]),
          ).values(),
        ]
      : undefined;
    const promise = Promise.resolve().then(async () => {
      const started = performance.now();
      try {
        this.store.runs.state.started(id);
        controller.signal.throwIfAborted();
        const savedSession = this.store.runs.session(binding.id)?.continuation;
        const savedToolVersion = this.store.runs.session(binding.id)?.toolVersion ?? 0;
        await runtime.run({
          text,
          tools: definitions,
          session: savedSession,
          toolVersion: savedToolVersion,
          priorHistory:
            binding.config.provider === 'codex' &&
            savedSession &&
            savedToolVersion < ROOM_TOOL_VERSION
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
                output = 'Spoken summary recorded.';
              } else if (name === 'address_panelist') {
                if (
                  Object.keys(input).length !== 1 ||
                  (input.recipient !== 'a' && input.recipient !== 'b') ||
                  input.recipient === agent
                )
                  throw new BadRequestException('Provide only the other panelist recipient.');
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
        if (controller.signal.aborted) store.finish(id, 'stopped', performance.now() - started);
        else {
          const message = error instanceof Error ? error.message : 'The agent connection failed.';
          store.finish(id, 'failed', performance.now() - started);
          store.setError(agent, message);
          if (/auth|unauthorized|api.key|login|401|403|model.*(not|unavailable)/i.test(message)) {
            runtime.info.status = 'unavailable';
            runtime.info.reason = message;
          }
        }
      } finally {
        this.active.delete(key);
        this.emitBoth(turn.run_id);
        this.scheduleDrain();
      }
    });
    this.active.set(key, { controller, promise, turn });
    this.emitBoth(turn.run_id);
  }
  async stop(agent: AgentId, runId = this.store.runs.currentId()) {
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
    this.store.forRun(runId).cancelAllConversations('Conversation stopped by Sid.');
    const active = [...this.active.values()].filter((turn) => turn.turn.run_id === runId);
    active.forEach((turn) => turn.controller.abort());
    await Promise.allSettled(active.map((turn) => turn.promise));
    this.emitBoth(runId);
    return { stopped: true };
  }
  async onModuleDestroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    for (const run of this.store.runs.list()) await this.stopConversation(run.id);
    for (const expressions of this.expressionRuns.values()) expressions.close();
    this.store.close();
  }
}
