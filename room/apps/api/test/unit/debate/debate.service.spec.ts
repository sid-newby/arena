import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import {
  DEFAULT_MODELS,
  type ParticipantBinding,
  type SeatId,
  type TaskDraft,
} from '../../../src/runs/run.contract.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';
import { DebateService } from '../../../src/debate/debate.service.js';
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const task: TaskDraft = {
  question: 'Compare two small approaches.',
  mode: 'reasoning',
  expectedArtifact: 'Evidence and a recommendation.',
  criteria: ['Correctness'],
  grounding: ['Shared input.'],
  source: null,
  profile: 'analysis',
  maxHandoffs: 1,
  timeLimitSeconds: 60,
};
describe('Reviewed debate lifecycle', () => {
  let runId: string,
    directory: string,
    store: ChatStore,
    chat: ChatService,
    manager: WorkspaceManager,
    debate: DebateService;
  let execute: (seat: SeatId, context: TurnContext) => Promise<void>;
  const observed: { seat: SeatId; context: TurnContext }[] = [];
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'room-workflow-'));
    store = new ChatStore(':memory:', directory);
    runId = store.runs.currentId();
    manager = new WorkspaceManager({ controlRoot: join(directory, 'control') });
    observed.length = 0;
    execute = async (seat, context) => context.append(seat + ' evidence');
    const factory = (binding: ParticipantBinding): AgentRuntime => ({
      info: {
        id: binding.role,
        name: binding.role,
        ...binding.config,
        runtime: 'test',
        status: 'ready',
      },
      run: async (context) => {
        if (binding.role !== 'a' && binding.role !== 'b') throw new Error('Unexpected role');
        observed.push({ seat: binding.role, context });
        await execute(binding.role, context);
      },
    });
    chat = ChatService.forTest(
      store,
      { a: factory(store.runs.binding(runId, 'a')), b: factory(store.runs.binding(runId, 'b')) },
      directory,
      {
        runtimeFactory: factory,
        catalogReader: async (provider) => ({
          provider,
          status: 'ready',
          models: [
            {
              id: provider === 'codex' ? 'gpt-6-luna' : 'claude-opus-5-5',
              name: 'test',
              efforts: ['high'],
            },
          ],
        }),
      },
    );
    debate = DebateService.forTest(chat, manager);
  });
  afterEach(async () => {
    debate.onModuleDestroy();
    await chat.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
  });
  async function ready() {
    let value = debate.saveTask(runId, { expectedRevision: chat.run(runId).revision, task });
    value = await debate.prepare(runId, { expectedRevision: value.revision });
    expect(value.phase).toBe('ready');
    return value;
  }
  it('keeps saved outputs readable after the managed workspace location changes without adopting old paths', async () => {
    debate.onModuleDestroy();
    manager = new WorkspaceManager({
      controlRoot: join(directory, 'control'),
      managedRoot: join(directory, 'original-workspaces'),
    });
    debate = DebateService.forTest(chat, manager);
    await ready();
    const workspace = manager.workspace(runId, 'a');
    writeFileSync(join(workspace.root, 'private.txt'), 'Keep this workspace intact.');
    const artifact = manager.publish({
      workspace,
      turnId: 'saved-turn',
      path: 'result.md',
      content: Buffer.from('An immutable result.'),
    });
    store.runs.workflows.update(runId, { error: 'An earlier workflow error.' });
    const manifest = join(manager.controlRoot, 'runs', runId, 'workspaces.json');
    const originalManifest = readFileSync(manifest, 'utf8');
    debate.onModuleDestroy();
    manager = new WorkspaceManager({
      controlRoot: manager.controlRoot,
      managedRoot: join(directory, 'new-workspaces'),
    });
    debate = DebateService.forTest(chat, manager);
    const snapshot = debate.snapshot(runId);
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.task).toEqual(task);
    expect(snapshot.workspaces).toBeNull();
    expect(snapshot.workspaceError).toContain('another application location');
    expect(snapshot.error).toBe('An earlier workflow error.');
    expect(snapshot.artifacts).toContainEqual(expect.objectContaining({ id: artifact.id }));
    expect(() => manager.workspace(runId, 'a')).toThrow('another application location');
    expect(() => manager.retain(runId)).toThrow('another application location');
    expect(readFileSync(manifest, 'utf8')).toBe(originalManifest);
    expect(readFileSync(join(workspace.root, 'private.txt'), 'utf8')).toBe(
      'Keep this workspace intact.',
    );
    const malformed = JSON.parse(originalManifest);
    malformed.seats.b.root = join(directory, 'unexpected');
    writeFileSync(manifest, JSON.stringify(malformed));
    expect(() => debate.snapshot(runId)).toThrow(
      'Workspace manifest root does not match its owner.',
    );
  });
  it('delivers one durable feedback event when both independent results finish', async () => {
    const value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'feedback-start' });
    await settle();
    expect(debate.snapshot(runId).phase).toBe('awaiting-comparison');
    const send = vi.fn<() => Promise<void>>(async () => undefined);
    debate.setFeedbackSender(send);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(runId, expect.objectContaining({ kind: 'results-ready' }));
    debate.setFeedbackSender(send);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('reports exhausted feedback and retries it only on request', async () => {
    store.runs.workflows.update(runId, {}, 'workflow.candidate-failed');
    const [event] = store.runs.workflows.pendingFeedback(Date.now());
    expect(event).toBeDefined();
    for (let attempts = 0; attempts < 8; attempts++)
      store.runs.workflows.finishFeedback(event.id, false, attempts, Date.now());
    expect(debate.feedbackDelivery(runId)).toEqual({ failed: 1 });
    expect(store.runs.workflows.pendingFeedback(Date.now() + 360000)).toHaveLength(0);
    const send = vi.fn<() => Promise<void>>(async () => undefined);
    debate.setFeedbackSender(send);
    expect(debate.retryFeedbackDelivery(runId)).toEqual({ failed: 0 });
    await settle();
    expect(send).toHaveBeenCalledOnce();
    expect(debate.feedbackDelivery(runId)).toEqual({ failed: 0 });
  });
  it('stores each saved goal and the resolved source commit as independent task revisions', async () => {
    const source = join(directory, 'source');
    mkdirSync(source);
    execFileSync('git', ['init', '-q', source]);
    writeFileSync(join(source, 'input.txt'), 'Shared repository input');
    execFileSync('git', ['-C', source, 'add', 'input.txt']);
    execFileSync('git', [
      '-C',
      source,
      '-c',
      'user.name=State test',
      '-c',
      'user.email=state@example.test',
      'commit',
      '-qm',
      'source',
    ]);
    const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const first = debate.saveTask(runId, { expectedRevision: 1, task });
    const draft = debate.saveTask(runId, {
      expectedRevision: first.revision,
      task: { ...task, source: { repository: source, revision: 'HEAD' } },
    });
    await debate.prepare(runId, { expectedRevision: draft.revision });
    expect(store.runs.state.get(runId).taskRevisions).toMatchObject([
      {
        revision: 3,
        origin: 'resolved-source',
        task: { source: { repository: realpathSync(source), revision } },
      },
      { revision: 2, origin: 'draft-save', task: { source: { revision: 'HEAD' } } },
      { revision: 1, origin: 'draft-save', task: { source: null } },
    ]);
  });
  it('retries preparation after verification fails with an inferred project destination', async () => {
    const source = join(realpathSync(directory), 'new-project');
    debate.onModuleDestroy();
    let attempts = 0;
    debate = DebateService.forTest(chat, manager, async () => {
      if (++attempts === 1) throw new Error('Verification failed');
    });
    const draft = debate.saveTask(runId, {
      expectedRevision: 1,
      task: { ...task, source: { repository: source, revision: 'HEAD' } },
    });
    const failed = await debate.prepare(runId, { expectedRevision: draft.revision });
    expect(failed.phase).toBe('failed');
    const retried = await debate.prepare(runId, { expectedRevision: failed.revision });
    expect(retried.phase).toBe('ready');
    expect(manager.get(runId)?.projectDirectory).toBe(source);
  });
  it.each(['completed', 'stopped'] as const)(
    'requires a new run for direct human work after a %s structured task',
    async (phase) => {
      await ready();
      store.runs.workflows.update(runId, { phase });
      await expect(
        chat.submit(
          'b',
          {
            expectedRevision: chat.run(runId).revision,
            requestId: 'terminal-human-request',
            text: 'Continue working in this workspace.',
          },
          runId,
        ),
      ).rejects.toThrow('Create a new run');
      expect(observed).toHaveLength(0);
    },
  );
  it('advertises explicit retries when dispatch fails before any turn exists', async () => {
    const value = await ready();
    const dispatch = vi
      .spyOn(chat, 'submitWorkflow')
      .mockRejectedValueOnce(new Error('Unavailable'));
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'missing-dispatch' });
    const interrupted = debate.snapshot(runId);
    expect(interrupted).toMatchObject({ phase: 'paused', retrySeats: ['a', 'b'] });
    expect(chat.snapshot('a', runId).messages).toHaveLength(0);
    await expect(
      debate.resume(runId, {
        expectedRevision: interrupted.revision,
        requestId: 'missing-unselected',
      }),
    ).rejects.toThrow('retrySeats');
    dispatch.mockRestore();
    await debate.resume(runId, {
      expectedRevision: interrupted.revision,
      requestId: 'missing-selected',
      retrySeats: ['a', 'b'],
    });
    await settle();
    expect(debate.snapshot(runId)).toMatchObject({ phase: 'awaiting-comparison', retrySeats: [] });
    expect(observed).toHaveLength(2);
  });
  it('uses current-stage dispatch identity instead of a previous completed reply for recovery', async () => {
    const value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'prior-independent' });
    await settle();
    const original = chat.submitWorkflow.bind(chat);
    vi.spyOn(chat, 'submitWorkflow')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('B unavailable before comparison'));
    await debate.compare(runId, {
      expectedRevision: chat.run(runId).revision,
      requestId: 'missing-comparison',
    });
    await settle();
    expect(chat.snapshot('b', runId).messages.at(-1)?.status).toBe('completed');
    expect(debate.snapshot(runId)).toMatchObject({ phase: 'paused', retrySeats: ['b'] });
  });
  it('prepares independent roots, rotates both bindings and rejects stale or duplicate starts', async () => {
    const before = store.runs.binding(runId, 'a');
    const value = await ready();
    expect(value.workspaces?.seats.a.root).not.toBe(value.workspaces?.seats.b.root);
    expect(store.runs.binding(runId, 'a').id).not.toBe(before.id);
    expect(store.runs.binding(runId, 'a').toolProfile).toBe('analysis');
    await expect(
      debate.start(runId, { expectedRevision: 1, requestId: 'stale-start' }),
    ).rejects.toThrow('changed');
    const body = { expectedRevision: value.revision, requestId: 'start-request' };
    await debate.start(runId, body);
    await debate.start(runId, body);
    await settle();
    expect(observed).toHaveLength(2);
    expect(debate.snapshot(runId).phase).toBe('awaiting-comparison');
  });
  it('denies peer tools and already-published sibling artifacts during independent work', async () => {
    execute = async (_seat, context) => {
      await new Promise<void>((resolve) =>
        context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };
    const value = await ready();
    await debate.start(runId, {
      expectedRevision: value.revision,
      requestId: 'independent-start',
    });
    await settle();
    const a = observed.find((item) => item.seat === 'a')!,
      b = observed.find((item) => item.seat === 'b')!;
    const artifact = manager.publish({
      workspace: manager.workspace(runId, 'a'),
      turnId: 'published-first',
      path: 'analysis.txt',
      content: Buffer.from('A secret independent result'),
    });
    await expect(a.context.tool('address_panelist', { recipient: 'b' })).rejects.toThrow(
      'discussion',
    );
    await expect(b.context.tool('read_artifact', { artifactId: artifact.id })).rejects.toThrow(
      'independent',
    );
    expect(await a.context.tool('read_artifact', { artifactId: artifact.id })).toContain(
      'A secret independent result',
    );
    await chat.stopConversation(runId);
    expect(debate.snapshot(runId).phase).toBe('stopped');
  });
  it('lets both analysis seats publish text outputs through their advertised runtime tools', async () => {
    execute = async (_seat, context) => {
      await new Promise<void>((resolve) =>
        context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    };
    const value = await ready();
    await debate.start(runId, {
      expectedRevision: value.revision,
      requestId: 'text-artifact-start',
    });
    await settle();
    expect(observed).toHaveLength(2);
    const published: string[] = [];
    for (const { seat, context } of observed) {
      expect(context.tools?.map((tool) => tool.name)).toContain('publish_text_artifact');
      expect(context.tools?.map((tool) => tool.name)).not.toContain('write_file');
      expect(context.text).toContain('Publish completed text directly with publish_text_artifact');
      const result = JSON.parse(
        await context.tool('publish_text_artifact', {
          path: 'recommendation.md',
          text: `${seat} independent recommendation`,
        }),
      );
      published.push(result.id);
      expect(debate.artifactView(runId, result.id).text).toBe(`${seat} independent recommendation`);
      expect(debate.artifactView(runId, result.id).artifact.seat).toBe(seat);
    }
    expect(debate.snapshot(runId).artifacts).toHaveLength(2);
    const other = observed.find((item) => item.seat === 'b');
    expect(other).toBeDefined();
    await expect(
      other!.context.tool('read_artifact', { artifactId: published[0] }),
    ).rejects.toThrow('independent');
    expect(
      store.runs.correspondence(runId).filter((event) => event.kind === 'artifact.published'),
    ).toHaveLength(2);
    await chat.stopConversation(runId);
  });
  it('opens comparison only after both outputs and makes attributed peer snapshots readable', async () => {
    let value = await ready();
    await debate.start(runId, {
      expectedRevision: value.revision,
      requestId: 'independent-start',
    });
    await settle();
    value = debate.snapshot(runId);
    expect(value.phase).toBe('awaiting-comparison');
    const artifact = manager.publish({
      workspace: manager.workspace(runId, 'a'),
      turnId: 'original-a',
      path: 'a.txt',
      content: Buffer.from('immutable A'),
    });
    let peerArtifact = '';
    execute = async (_seat, context) => {
      peerArtifact = await context.tool('read_artifact', { artifactId: artifact.id });
    };
    await debate.compare(runId, {
      expectedRevision: value.revision,
      requestId: 'compare-request',
    });
    await settle();
    expect(observed).toHaveLength(4);
    expect(observed.at(-1)?.context.text).toContain('a evidence');
    expect(peerArtifact).toContain('immutable A');
  });
  it('pauses a failed barrier and retries only an explicitly selected unfinished candidate', async () => {
    let fail = true;
    execute = async (seat, context) => {
      if (seat === 'b' && fail) throw new Error('Candidate B failed');
      context.append(seat + ' done');
    };
    let value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'failed-start' });
    await settle();
    value = debate.snapshot(runId);
    expect(value.phase).toBe('paused');
    await expect(
      debate.resume(runId, { expectedRevision: value.revision, requestId: 'implicit-retry' }),
    ).rejects.toThrow('retrySeats');
    fail = false;
    await debate.resume(runId, {
      expectedRevision: value.revision,
      requestId: 'explicit-retry',
      retrySeats: ['b'],
    });
    await settle();
    expect(observed.filter((item) => item.seat === 'a')).toHaveLength(1);
    expect(observed.filter((item) => item.seat === 'b')).toHaveLength(2);
    const bAttempts = store.runs.state
      .get(runId)
      .attempts.filter((attempt) => attempt.role === 'b');
    expect(bAttempts[1]).toMatchObject({
      retryOf: bAttempts[0].turnId,
      taskRevision: 1,
      stage: 'independent',
      trigger: 'workflow',
    });
    expect(debate.snapshot(runId).phase).toBe('awaiting-comparison');
  });
  it('keeps failed independent candidates private when discussion is requested', async () => {
    execute = async (seat, context) => {
      if (seat === 'b') throw new Error('B unavailable');
      context.append('Independent A result');
    };
    let value = await ready();
    await debate.start(runId, {
      expectedRevision: value.revision,
      requestId: 'failed-independent',
    });
    await settle();
    value = debate.snapshot(runId);
    expect(value.phase).toBe('paused');
    await expect(
      debate.discuss(runId, { expectedRevision: value.revision, requestId: 'premature-discuss' }),
    ).rejects.toThrow('unfinished');
    expect(observed).toHaveLength(2);
    expect(debate.snapshot(runId).phase).toBe('paused');
  });
  it.each(['resolve', 'reject'] as const)(
    'does not let an older preparation %s change a newer preparation',
    async (outcome) => {
      const attempts: { resolve: () => void; reject: (error: Error) => void }[] = [];
      debate.onModuleDestroy();
      debate = DebateService.forTest(
        chat,
        manager,
        () => new Promise<void>((resolve, reject) => attempts.push({ resolve, reject })),
      );
      const draft = debate.saveTask(runId, { expectedRevision: 1, task });
      const first = debate.prepare(runId, { expectedRevision: draft.revision });
      await vi.waitFor(() => expect(attempts).toHaveLength(1));
      await chat.stopConversation(runId);
      const second = debate.prepare(runId, { expectedRevision: chat.run(runId).revision });
      await vi.waitFor(() => expect(attempts).toHaveLength(2));
      if (outcome === 'resolve') attempts[0]!.resolve();
      else attempts[0]!.reject(new Error('Old verifier failed'));
      await first;
      expect(debate.snapshot(runId).phase).toBe('preparing');
      attempts[1]!.resolve();
      expect((await second).phase).toBe('ready');
      expect(observed).toHaveLength(0);
    },
  );
  it('stopping preparation retains its result and never dispatches participants', async () => {
    let release!: () => void;
    debate.onModuleDestroy();
    debate = DebateService.forTest(
      chat,
      manager,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const draft = debate.saveTask(runId, { expectedRevision: 1, task });
    const preparing = debate.prepare(runId, { expectedRevision: draft.revision });
    await settle();
    await chat.stopConversation(runId);
    release();
    const result = await preparing;
    expect(result.phase).toBe('stopped');
    expect(result.workspaces?.state).toBe('retained');
    expect(observed).toHaveLength(0);
  });
  it('keeps action proposals private until explicit application and applies them once', async () => {
    const proposal = debate.propose(runId, {
      kind: 'instruction',
      target: 'both',
      text: 'Review the hidden user question.',
    }).proposal!;
    expect(JSON.stringify(chat.correspondence(runId))).not.toContain('hidden user question');
    expect(observed).toHaveLength(0);
    const body = { expectedRevision: 1, requestId: 'apply-instruction' };
    await debate.apply(runId, proposal.id, body);
    await debate.apply(runId, proposal.id, body);
    await settle();
    expect(observed).toHaveLength(2);
    expect(
      chat.correspondence(runId).events.filter((event) => event.kind === 'moderation.applied'),
    ).toHaveLength(1);
  });
  it('rejects moderation dispatch after the total deadline expires', async () => {
    let value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'moderation-start' });
    await settle();
    value = debate.snapshot(runId);
    expect(value.phase).toBe('awaiting-comparison');
    store.runs.workflows.update(runId, { deadline: Date.now() - 1 });
    const proposal = debate.propose(runId, {
      kind: 'instruction',
      target: 'b',
      text: 'Extra unbounded work',
    }).proposal!;
    await expect(
      debate.apply(runId, proposal.id, {
        expectedRevision: chat.run(runId).revision,
        requestId: 'expired-moderation',
      }),
    ).rejects.toThrow('budget');
    expect(observed).toHaveLength(2);
  });
  it.each(['completed', 'stopped'] as const)(
    'rejects moderation dispatch into a %s run',
    async (phase) => {
      let value = await ready();
      await debate.start(runId, { expectedRevision: value.revision, requestId: 'terminal-start' });
      await settle();
      value = debate.snapshot(runId);
      if (phase === 'completed') await debate.complete(runId, { expectedRevision: value.revision });
      else await chat.stopConversation(runId);
      const proposal = debate.propose(runId, {
        kind: 'instruction',
        target: 'a',
        text: 'Restart without review',
      }).proposal!;
      await expect(
        debate.apply(runId, proposal.id, {
          expectedRevision: chat.run(runId).revision,
          requestId: 'terminal-moderation',
        }),
      ).rejects.toThrow('new run');
      expect(observed).toHaveLength(2);
    },
  );
  it('stops moderation outputs at the original deadline while awaiting comparison', async () => {
    let value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'bounded-start' });
    await settle();
    value = debate.snapshot(runId);
    const proposal = debate.propose(runId, {
      kind: 'instruction',
      target: 'b',
      text: 'Bounded extra analysis',
    }).proposal!;
    execute = async (_seat, context) =>
      new Promise<void>((resolve) => {
        context.controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    await debate.apply(runId, proposal.id, {
      expectedRevision: value.revision,
      requestId: 'bounded-moderation',
    });
    expect(chat.busy(runId)).toBe(true);
    store.runs.workflows.update(runId, { deadline: Date.now() - 1 });
    expect(debate.snapshot(runId).phase).toBe('stopped');
    await settle();
    expect(chat.busy(runId)).toBe(false);
  });
  it('requires a whole-run target when proposing a pause', () => {
    expect(() => debate.propose(runId, { kind: 'pause', target: 'a' })).toThrow('both');
    expect(debate.propose(runId, { kind: 'pause', target: 'both' }).proposal?.target).toBe('both');
  });
  it('retains requested Maestro prose separately with immutable provenance', () => {
    const before = chat.snapshot('a', runId);
    const value = debate.synthesis(
      runId,
      { expectedRevision: 1, requestId: 'save-synthesis' },
      { id: 'maestro-analysis', text: '# Separate synthesis' },
    );
    const artifact = value.artifacts.find((item) => item.seat === 'maestro')!;
    expect(debate.artifactView(runId, artifact.id).text).toBe('# Separate synthesis');
    expect(artifact.mimeType).toBe('text/markdown');
    expect(chat.snapshot('a', runId).messages).toEqual(before.messages);
    expect(chat.snapshot('a', runId).status).toBe(before.status);
  });
  it('does not silently change models when Maestro proposes selections', async () => {
    const tools = debate.maestroTools();
    await tools.call(
      runId,
      'propose_models',
      { seats: { a: DEFAULT_MODELS.b, b: DEFAULT_MODELS.a } },
      new AbortController().signal,
    );
    expect(chat.run(runId).seats.a).toEqual(DEFAULT_MODELS.a);
    expect(debate.snapshot(runId).proposedSeats?.a).toEqual(DEFAULT_MODELS.b);
    expect(observed).toHaveLength(0);
  });
  it('freezes models and task after start while keeping ordinary runs independent', async () => {
    const value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'freeze-start' });
    await settle();
    const revision = chat.run(runId).revision;
    expect(() =>
      debate.saveTask(runId, {
        expectedRevision: revision,
        task: { ...task, question: 'Changed' },
      }),
    ).toThrow('new idle run');
    await expect(
      chat.configureRun(runId, {
        expectedRevision: revision,
        seats: { a: DEFAULT_MODELS.a, b: DEFAULT_MODELS.b },
      }),
    ).rejects.toThrow('frozen');
    const other = chat.createRun();
    await chat.submit('a', { text: 'Ordinary question', requestId: 'ordinary-request' }, other.id);
    await settle();
    expect(chat.snapshot('a', other.id).messages).toHaveLength(1);
  });
  it('assigns globally distinct initial run IDs while preserving reopened IDs', () => {
    const firstPath = join(directory, 'first.sqlite');
    const first = new ChatStore(firstPath, directory);
    const second = new ChatStore(':memory:', directory);
    const id = first.runs.currentId();
    expect(id).not.toBe(second.runs.currentId());
    expect(id).not.toBe('room');
    first.close();
    const reopened = new ChatStore(firstPath, directory);
    expect(reopened.runs.currentId()).toBe(id);
    reopened.close();
    second.close();
  });
  it('blocks manual work until the structured draft has been reviewed and started', async () => {
    debate.saveTask(runId, { expectedRevision: 1, task });
    await expect(
      chat.submit('a', { text: 'Premature work', requestId: 'before-prepare' }, runId),
    ).rejects.toThrow('task controls');
    expect(observed).toHaveLength(0);
  });
  it('supports maximum-length command IDs without replaying candidates', async () => {
    const value = await ready();
    const body = { expectedRevision: value.revision, requestId: 'a'.repeat(128) };
    await debate.start(runId, body);
    await debate.start(runId, body);
    await settle();
    expect(observed).toHaveLength(2);
    expect(debate.snapshot(runId).phase).toBe('awaiting-comparison');
  });
  it('holds comparison failures behind an explicit retry barrier', async () => {
    let value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'comparison-start' });
    await settle();
    value = debate.snapshot(runId);
    execute = async (seat, context) => {
      if (seat === 'b') throw new Error('Comparison unavailable');
      context.append('A comparison');
    };
    await debate.compare(runId, {
      expectedRevision: value.revision,
      requestId: 'failed-comparison',
    });
    await settle();
    expect(debate.snapshot(runId).phase).toBe('paused');
    expect(chat.snapshot('a', runId).messages[0]?.text).toBe('a evidence');
    await expect(
      debate.discuss(runId, {
        expectedRevision: chat.run(runId).revision,
        requestId: 'compare-skip-retry',
      }),
    ).rejects.toThrow('unfinished');
    await expect(
      debate.resume(runId, {
        expectedRevision: chat.run(runId).revision,
        requestId: 'compare-no-retry',
      }),
    ).rejects.toThrow('retrySeats');
  });
  it('pauses at the output boundary and does not reset the total time budget on resume', async () => {
    const releases: (() => void)[] = [];
    execute = async (seat, context) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      context.append(seat + ' complete');
    };
    let value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'pause-start' });
    await settle();
    value = debate.pause(runId, { expectedRevision: chat.run(runId).revision });
    expect(value.phase).toBe('independent');
    releases.forEach((release) => release());
    await settle();
    value = debate.snapshot(runId);
    expect(value.phase).toBe('paused');
    const deadline = store.runs.workflows.read(runId).deadline;
    await debate.resume(runId, { expectedRevision: value.revision, requestId: 'resume-complete' });
    expect(store.runs.workflows.read(runId).deadline).toBe(deadline);
    expect(observed).toHaveLength(2);
    expect(debate.snapshot(runId).phase).toBe('awaiting-comparison');
  });
  it('enforces a run-wide handoff budget and preserves independent results', async () => {
    let value = await ready();
    await debate.start(runId, { expectedRevision: value.revision, requestId: 'budget-start' });
    await settle();
    value = debate.snapshot(runId);
    let blocked = '';
    execute = async (seat, context) => {
      if (seat === 'a') {
        await context.tool('address_panelist', { recipient: 'b' });
        await context.tool('address_panelist', { recipient: 'b' });
      } else {
        try {
          await context.tool('address_panelist', { recipient: 'a' });
        } catch (error) {
          blocked = error instanceof Error ? error.message : String(error);
        }
      }
      context.append(seat + ' discussion');
    };
    await debate.discuss(runId, { expectedRevision: value.revision, requestId: 'budget-discuss' });
    await vi.waitFor(() => expect(observed).toHaveLength(4));
    expect(blocked).toContain('budget');
    expect(store.runs.workflows.read(runId).handoffs).toBe(1);
    expect(chat.snapshot('a', runId).messages[0]?.text).toBe('a evidence');
  });
  it('recovers an interrupted step without replaying it on reopening SQLite', () => {
    const path = join(directory, 'restart.sqlite');
    const first = new ChatStore(path, directory);
    const id = first.runs.currentId();
    first.runs.workflows.update(id, {
      task,
      phase: 'independent',
      stage: 'independent',
      startedAt: Date.now(),
      deadline: Date.now() + 60000,
    });
    first.close();
    const reopened = new ChatStore(path, directory);
    expect(reopened.runs.workflows.read(id).phase).toBe('interrupted');
    expect(reopened.snapshot('a').messages).toHaveLength(0);
    reopened.close();
    expect(observed).toHaveLength(0);
  });
});
