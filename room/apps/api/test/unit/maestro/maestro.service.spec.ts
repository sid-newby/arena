import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatService } from '../../../src/chat/chat.service.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import {
  MaestroService,
  type MaestroRunToolProvider,
} from '../../../src/maestro/maestro.service.js';
import { MaestroStore } from '../../../src/maestro/maestro.store.js';
import { sessionFingerprint } from '../../../src/maestro/maestro.types.js';
import { DEFAULT_MODELS } from '../../../src/runs/run.contract.js';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const waitForAbort = (context: TurnContext) =>
  new Promise<void>((resolve) =>
    context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
  );
function runtime(id: 'a' | 'b' | 'maestro', run: AgentRuntime['run']): AgentRuntime {
  return {
    info: {
      id,
      name: id.toUpperCase(),
      provider: 'codex',
      model: id === 'maestro' ? 'gpt-6.1-sol' : 'gpt-6-luna',
      effort: 'high',
      runtime: 'test subscription',
      status: 'ready',
    },
    run,
  };
}

describe('Private Maestro chat', () => {
  let directory: string;
  let chat: ChatService;
  let maestro: MaestroService;
  let store: MaestroStore;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'maestro-private-'));
    const publicStore = new ChatStore(':memory:', directory);
    chat = ChatService.forTest(
      publicStore,
      { a: runtime('a', async () => {}), b: runtime('b', async () => {}) },
      directory,
      {
        catalogReader: async (provider) => ({
          provider,
          status: 'ready',
          models: [
            { id: 'gpt-6-luna', name: 'Luna', efforts: ['high'] },
            { id: 'gpt-6.1-sol', name: 'Sol', efforts: ['high'] },
            { id: 'claude-opus-5-5', name: 'Opus', efforts: ['high'] },
          ],
        }),
      },
    );
  });
  afterEach(async () => {
    await maestro?.onModuleDestroy();
    await chat.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
  });
  function setup(run: AgentRuntime['run'], path = ':memory:', runTools?: MaestroRunToolProvider) {
    store = new MaestroStore(path);
    maestro = MaestroService.forTest({
      chat,
      store,
      workspaceRoot: directory,
      runtimeFactory: () => runtime('maestro', run),
      runTools,
    });
    return chat.currentRun().id;
  }
  it('keeps private prompts and responses outside public A/B correspondence', async () => {
    let turns = 0;
    const runId = setup(async (context) => {
      turns++;
      context.append('Private comparison.');
    });
    const before = chat.correspondence(runId, 0, 500);
    maestro.snapshot(runId);
    await settle();
    expect(turns).toBe(0);
    await maestro.submit(runId, { text: 'Private setup notes', requestId: 'private-01' });
    await settle();
    expect(maestro.snapshot(runId)).toMatchObject({
      model: 'gpt-6.1-sol',
      effort: 'high',
      status: 'idle',
      messages: [
        { role: 'user', text: 'Private setup notes' },
        { role: 'assistant', text: 'Private comparison.', status: 'completed' },
      ],
    });
    expect(chat.correspondence(runId, 0, 500)).toEqual(before);
    expect(chat.snapshot('a', runId).messages).toHaveLength(0);
    expect(chat.snapshot('b', runId).messages).toHaveLength(0);
  });
  it('orients a fresh draft toward the debate question using captured workflow context', async () => {
    let request: TurnContext | undefined;
    const runId = setup(async (context) => {
      request = context;
      context.append('What should the debate be about?');
    });
    const submission = maestro.submit(runId, {
      text: 'Help me get started',
      requestId: 'setup-01',
    });
    chat.workflowPersistence().workflows.update(runId, { phase: 'paused' });
    await submission;
    await settle();
    expect(request?.text).toContain('"workflow":{"phase":"draft","task":null}');
    expect(request?.instructions).toContain('First establish the required debate question.');
    expect(request?.instructions).toContain(
      'do not look for existing criteria, outcomes, or candidate results',
    );
  });
  it('includes configured task criteria for debate analysis without fresh-setup instructions', async () => {
    let request: TurnContext | undefined;
    const runId = setup(async (context) => {
      request = context;
      context.append('The recorded task is ready to analyze.');
    });
    chat.workflowPersistence().workflows.update(runId, {
      phase: 'discussion',
      task: {
        question: 'Which prototype is easier to test?',
        mode: 'prototype',
        expectedArtifact: 'A working prototype',
        criteria: ['Starts with task dev'],
        grounding: [],
        source: null,
        profile: 'build',
        maxHandoffs: 2,
        timeLimitSeconds: 300,
      },
    });
    await maestro.submit(runId, { text: 'Review our criteria', requestId: 'analysis-01' });
    await settle();
    expect(request?.text).toContain('"phase":"discussion"');
    expect(request?.text).toContain('Starts with task dev');
    expect(request?.instructions).not.toContain('This run is a new draft');
    expect(request?.instructions).toContain('cite correspondence sequence numbers or turn IDs');
  });
  it('generates criteria bound to the submitted setup and retains the request after restart', async () => {
    const path = join(directory, 'criteria.sqlite');
    let request: TurnContext | undefined;
    const runId = setup(async (context) => {
      request = context;
      context.append('{"criteria":["The prototype starts"]}');
    }, path);
    const draft = {
      draftRevision: 2,
      question: 'Build a prototype',
      mode: 'prototype',
      expectedArtifact: 'App',
      criteria: [],
      grounding: [],
      source: null,
    };
    const result = await maestro.generateCriteria(runId, { requestId: 'criteria-123', draft });
    await settle();
    expect(request?.instructions).toContain('Return only the JSON object requested.');
    expect(request?.instructions).not.toContain('First establish the required debate question.');
    expect(maestro.criteriaResult(runId, result.turnId)).toMatchObject({
      status: 'completed',
      draftRevision: 2,
      criteria: ['The prototype starts'],
    });
    await maestro.onModuleDestroy();
    store = new MaestroStore(path);
    maestro = MaestroService.forTest({
      chat,
      store,
      workspaceRoot: directory,
      runtimeFactory: () => runtime('maestro', async () => {}),
    });
    expect(maestro.criteriaResult(runId, result.turnId)).toMatchObject({
      status: 'completed',
      draftRevision: 2,
      criteria: ['The prototype starts'],
    });
    expect(() => maestro.criteriaResult('another-run', result.turnId)).toThrow('Unknown run.');
  });
  it('keeps feedback private, deduplicates events, and stores read and resolution separately', async () => {
    let calls = 0;
    const path = join(directory, 'feedback.sqlite');
    const runId = setup(async (context) => {
      calls++;
      context.append('What should happen next?');
    }, path);
    const event = { eventId: 'blocked-1', kind: 'blocked' as const, question: true };
    const first = await maestro.feedbackEvent(runId, event);
    await settle();
    expect(await maestro.feedbackEvent(runId, event)).toEqual(first);
    expect(calls).toBe(1);
    expect(maestro.snapshot(runId).messages).toMatchObject([
      {
        role: 'assistant',
        text: 'What should happen next?',
        feedback: { eventId: event.eventId, read: false, question: 'unresolved' },
      },
    ]);
    maestro.markFeedback(runId, first.turnId, 'read');
    await maestro.onModuleDestroy();
    store = new MaestroStore(path);
    maestro = MaestroService.forTest({
      chat,
      store,
      workspaceRoot: directory,
      runtimeFactory: () => runtime('maestro', async () => {}),
    });
    expect(maestro.snapshot(runId).messages[0].feedback).toMatchObject({
      read: true,
      question: 'unresolved',
    });
    maestro.markFeedback(runId, first.turnId, 'resolve');
    expect(maestro.snapshot(runId).messages[0].feedback?.question).toBe('resolved');
    expect(chat.snapshot('a', runId).messages).toHaveLength(0);
  });
  it('retries failed feedback and marks a generated question unresolved', async () => {
    let calls = 0;
    const runId = setup(async (context) => {
      calls++;
      if (calls === 1) throw new Error('Temporary provider failure');
      context.append('Which option should we use?');
    });
    const event = { eventId: 'retry-1', kind: 'blocked' as const };
    await expect(maestro.feedbackEvent(runId, event)).rejects.toThrow('could not finish');
    const result = await maestro.feedbackEvent(runId, event);
    expect(calls).toBe(2);
    expect(
      maestro.snapshot(runId).messages.find((message) => message.turnId === result.turnId),
    ).toMatchObject({ feedback: { eventId: event.eventId, question: 'unresolved' } });
    expect(await maestro.feedbackEvent(runId, event)).toEqual(result);
    expect(calls).toBe(2);
    expect(maestro.snapshot(runId).messages.every((message) => message.role === 'assistant')).toBe(
      true,
    );
  });
  it('can chat and cancel Maestro while both debate turns keep their identity and activity', async () => {
    await chat.onModuleDestroy();
    chat = ChatService.forTest(
      new ChatStore(':memory:', directory),
      { a: runtime('a', waitForAbort), b: runtime('b', waitForAbort) },
      directory,
    );
    const runId = setup(async (context) => {
      context.append('Comparing...');
      await waitForAbort(context);
    });
    const a = await chat.submit('a', { text: 'A task', requestId: 'seat-a-01' }, runId);
    const b = await chat.submit('b', { text: 'B task', requestId: 'seat-b-01' }, runId);
    await settle();
    await maestro.submit(runId, { text: 'Compare the drafts', requestId: 'private-02' });
    await settle();
    await maestro.stop(runId, { requestId: 'private-02' });
    expect(maestro.snapshot(runId).messages.at(-1)?.status).toBe('stopped');
    expect(chat.snapshot('a', runId)).toMatchObject({
      status: 'working',
      messages: [{ id: a.turnId, status: 'streaming' }],
    });
    expect(chat.snapshot('b', runId)).toMatchObject({
      status: 'working',
      messages: [{ id: b.turnId, status: 'streaming' }],
    });
  });
  it('remembers a cancellation that arrives before its submission and never starts inference', async () => {
    let calls = 0;
    const runId = setup(async () => {
      calls++;
    });
    await maestro.stop(runId, { requestId: 'cancel-before-submit' });
    await expect(
      maestro.submit(runId, { text: 'Delayed request', requestId: 'cancel-before-submit' }),
    ).rejects.toThrow('cancelled');
    await settle();
    expect(calls).toBe(0);
    expect(store.history(runId)).toHaveLength(0);
  });
  it('does not let a delayed stop for a completed turn cancel its successor', async () => {
    let calls = 0;
    const runId = setup(async (context) => {
      calls++;
      if (calls === 1) context.append('Completed first response');
      else await waitForAbort(context);
    });
    const first = await maestro.submit(runId, {
      text: 'First question',
      requestId: 'cancel-stale-first',
    });
    await settle();
    const second = await maestro.submit(runId, {
      text: 'Second question',
      requestId: 'cancel-stale-second',
    });
    await settle();
    await maestro.stop(runId, { turnId: first.turnId });
    expect(maestro.snapshot(runId)).toMatchObject({ status: 'working' });
    expect(store.history(runId).at(-1)).toMatchObject({ id: second.turnId, status: 'streaming' });
  });
  it('retains a pending cancellation through a private-store restart', async () => {
    const path = join(directory, 'cancelled.sqlite');
    let calls = 0;
    const runId = setup(async () => {
      calls++;
    }, path);
    await maestro.stop(runId, { requestId: 'cancel-before-restart' });
    await maestro.onModuleDestroy();
    store = new MaestroStore(path);
    maestro = MaestroService.forTest({
      chat,
      store,
      workspaceRoot: directory,
      runtimeFactory: () =>
        runtime('maestro', async () => {
          calls++;
        }),
    });
    await expect(
      maestro.submit(runId, { text: 'Late request', requestId: 'cancel-before-restart' }),
    ).rejects.toThrow('cancelled');
    expect(calls).toBe(0);
  });
  it('requires an explicit stop identity and never treats malformed targets as stop-current', async () => {
    const runId = setup(waitForAbort);
    const active = await maestro.submit(runId, {
      text: 'Keep this response',
      requestId: 'cancel-valid-active',
    });
    await settle();
    for (const invalid of [
      undefined,
      {},
      { requestId: 'short' },
      { turnId: active.turnId, requestId: 'cancel-valid-active' },
    ])
      await expect(maestro.stop(runId, invalid)).rejects.toThrow('exactly one');
    await maestro.stop(runId, { turnId: 'unknown-turn-id' });
    expect(maestro.snapshot(runId).status).toBe('working');
    await maestro.stop(runId, { requestId: 'cancel-valid-active' });
    expect(store.find(runId, 'cancel-valid-active')?.status).toBe('stopped');
    expect(
      await maestro.submit(runId, { text: 'Keep this response', requestId: 'cancel-valid-active' }),
    ).toEqual(active);
  });
  it('deduplicates the same request before and after completion and rejects conflicting text', async () => {
    let calls = 0;
    const runId = setup(async (context) => {
      calls++;
      context.append('Once');
    });
    const body = { text: 'One question', requestId: 'private-03' };
    const first = await maestro.submit(runId, body);
    expect(await maestro.submit(runId, body)).toEqual(first);
    await settle();
    expect(await maestro.submit(runId, body)).toEqual(first);
    await expect(maestro.submit(runId, { ...body, text: 'Different question' })).rejects.toThrow(
      'different text',
    );
    expect(calls).toBe(1);
    expect(maestro.snapshot(runId).messages).toHaveLength(2);
  });
  it('rejects overlap and invalid request data without losing the original private turn', async () => {
    const runId = setup(waitForAbort);
    await expect(maestro.submit(runId, { text: '', requestId: 'private-04' })).rejects.toThrow(
      'Provide text',
    );
    await maestro.submit(runId, { text: 'Keep working', requestId: 'private-04' });
    await settle();
    await expect(
      maestro.submit(runId, { text: 'Overlap', requestId: 'private-05' }),
    ).rejects.toThrow('already replying');
    expect(maestro.snapshot(runId).messages).toHaveLength(2);
  });
  it('caps context tools at the captured boundary while public correspondence advances', async () => {
    let captured: TurnContext | undefined;
    const runId = setup(async (context) => {
      captured = context;
      await waitForAbort(context);
    });
    await chat.submit('a', { text: 'Known evidence', requestId: 'seat-a-02' }, runId);
    await settle();
    const through = chat.correspondence(runId, 0, 1).through;
    await maestro.submit(runId, { text: 'Analyze current evidence', requestId: 'private-06' });
    await settle();
    expect(captured).toBeDefined();
    await chat.submit('b', { text: 'Later evidence', requestId: 'seat-b-02' }, runId);
    await settle();
    const result = JSON.parse(await captured!.tool('get_correspondence', { after: 0, limit: 50 }));
    expect(result.through).toBe(through);
    expect(result.events.every((event: { seq: number }) => event.seq <= through)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Later evidence');
    await expect(
      captured!.tool('get_correspondence_event', { sequence: through + 1 }),
    ).rejects.toThrow('within this analysis');
    expect(maestro.snapshot(runId)).toMatchObject({ analysisThroughSeq: through });
    expect(maestro.snapshot(runId).latestSeq).toBeGreaterThan(through);
  });
  it('captures unfinished A/B revisions as partial data without claiming they are committed replies', async () => {
    await chat.onModuleDestroy();
    chat = ChatService.forTest(
      new ChatStore(':memory:', directory),
      {
        a: runtime('a', async (context) => {
          context.append('Draft premise');
          await waitForAbort(context);
        }),
        b: runtime('b', async () => {}),
      },
      directory,
    );
    let contextText = '';
    const runId = setup(async (context) => {
      contextText = context.text;
      context.append('Partial analysis.');
    });
    const a = await chat.submit('a', { text: 'Build a premise', requestId: 'seat-a-03' }, runId);
    await settle();
    await maestro.submit(runId, { text: 'Inspect the draft', requestId: 'private-07' });
    await settle();
    const turn = store.history(runId)[0];
    expect(turn.partialRevisions).toMatchObject([
      { seat: 'a', turnId: a.turnId, text: 'Draft premise', truncated: false },
    ]);
    expect(contextText).toContain('partialRevisions');
    expect(contextText).toContain('Draft premise');
    expect(chat.snapshot('a', runId).status).toBe('working');
  });
  it('does not let a stopped callback replace a later continuation', async () => {
    const contexts: TurnContext[] = [];
    const runId = setup(async (context) => {
      contexts.push(context);
      context.saveSession('session-' + contexts.length, 4);
      if (contexts.length === 1) await waitForAbort(context);
      else context.append('New response');
    });
    await maestro.submit(runId, { text: 'First', requestId: 'private-08' });
    await settle();
    await maestro.stop(runId, { requestId: 'private-08' });
    await maestro.submit(runId, { text: 'Second', requestId: 'private-09' });
    await settle();
    contexts[0].saveSession('late-stale-session', 4);
    contexts[0].append('late stale text');
    const fingerprint = store.history(runId)[1].fingerprint;
    expect(store.session(runId, fingerprint)?.continuation).toBe('session-2');
    expect(maestro.snapshot(runId).messages.at(-1)?.text).toBe('New response');
  });
  it('separates private histories, requests, and continuations between runs', async () => {
    const seen: (string | undefined)[] = [];
    const runId = setup(async (context) => {
      seen.push(context.session);
      context.saveSession('session-' + seen.length, 4);
      context.append('Answer');
    });
    const other = chat.createRun().id;
    await maestro.submit(runId, { text: 'One run', requestId: 'private-10' });
    await settle();
    await maestro.submit(other, { text: 'Other run', requestId: 'private-10' });
    await settle();
    expect(seen).toEqual([undefined, undefined]);
    expect(maestro.snapshot(runId).messages[0].text).toBe('One run');
    expect(maestro.snapshot(other).messages[0].text).toBe('Other run');
  });
  it('fails an interrupted stored response after restart without replaying it', async () => {
    const path = join(directory, 'private.sqlite');
    let calls = 0;
    const runId = setup(async () => {
      calls++;
    }, path);
    const fingerprint = sessionFingerprint(DEFAULT_MODELS.maestro, join(directory, 'scratch'), 1);
    store.create({
      id: 'interrupted',
      runId,
      requestId: 'private-11',
      prompt: 'Interrupted question',
      throughSeq: 1,
      partialRevisions: [],
      fingerprint,
    });
    store.append('interrupted', 'Retained partial answer');
    await maestro.onModuleDestroy();
    store = new MaestroStore(path);
    maestro = MaestroService.forTest({
      chat,
      store,
      workspaceRoot: directory,
      runtimeFactory: () =>
        runtime('maestro', async () => {
          calls++;
        }),
    });
    expect(maestro.snapshot(runId)).toMatchObject({
      status: 'failed',
      messages: [
        { role: 'user', text: 'Interrupted question' },
        { role: 'assistant', text: 'Retained partial answer', status: 'failed' },
      ],
    });
    expect(calls).toBe(0);
    expect(
      await maestro.submit(runId, { text: 'Interrupted question', requestId: 'private-11' }),
    ).toEqual({ turnId: 'interrupted' });
    expect(calls).toBe(0);
  });
  it('refreshes awareness through SSE without starting background inference', async () => {
    let calls = 0;
    const runId = setup(async () => {
      calls++;
    });
    const seen: number[] = [];
    const subscription = maestro
      .events(runId)
      .subscribe((event) => seen.push(event.data.latestSeq));
    await chat.submit('a', { text: 'New public message', requestId: 'seat-a-04' }, runId);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(seen.at(-1)).toBeGreaterThan(seen[0]);
    expect(calls).toBe(0);
    subscription.unsubscribe();
  });
  it('dispatches only supplied run tools with this private turn cancellation signal', async () => {
    const calls: { runId: string; name: string; signal: AbortSignal }[] = [];
    const runTools: MaestroRunToolProvider = {
      definitions: () => [
        {
          name: 'propose_task',
          description: 'Propose a reviewed task draft.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
      call: async (runId, name, _input, signal) => {
        calls.push({ runId, name, signal });
        return 'Draft proposed';
      },
    };
    const runId = setup(
      async (context) => {
        context.append(await context.tool('propose_task', {}));
      },
      ':memory:',
      runTools,
    );
    await maestro.submit(runId, { text: 'Propose my task', requestId: 'private-12' });
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].runId).toBe(runId);
    expect(calls[0].name).toBe('propose_task');
    expect(calls[0].signal.aborted).toBe(false);
    expect(maestro.snapshot(runId).messages.at(-1)?.text).toBe('Draft proposed');
  });
  it('rejects run tools that collide with read-only context tools before creating a turn', async () => {
    const runTools: MaestroRunToolProvider = {
      definitions: () => [
        { name: 'get_correspondence', description: 'Collision', inputSchema: { type: 'object' } },
      ],
      call: async () => 'unreachable',
    };
    const runId = setup(async () => {}, ':memory:', runTools);
    await expect(
      maestro.submit(runId, { text: 'Question', requestId: 'private-13' }),
    ).rejects.toThrow('Duplicate Maestro tool');
    expect(store.history(runId)).toHaveLength(0);
  });
  it('refuses unknown tool names instead of forwarding them to the run tool provider', async () => {
    let calls = 0;
    const runTools: MaestroRunToolProvider = {
      definitions: () => [],
      call: async () => {
        calls++;
        return 'unreachable';
      },
    };
    const runId = setup(
      async (context) => {
        await context.tool('publish_to_both', {});
      },
      ':memory:',
      runTools,
    );
    await maestro.submit(runId, { text: 'Analyze privately', requestId: 'private-14' });
    await settle();
    expect(calls).toBe(0);
    expect(maestro.snapshot(runId)).toMatchObject({
      status: 'failed',
      error: 'This Maestro tool is unavailable.',
    });
  });
  it('restores private setup context when a run revision requires a fresh provider session', async () => {
    const contexts: TurnContext[] = [];
    let olderPrivate = '';
    const runId = setup(async (context) => {
      contexts.push(context);
      context.saveSession('private-continuation-' + contexts.length, 4);
      if (contexts.length === 1) context.append('Keep the mobile accessibility constraint.');
      else {
        olderPrivate = await context.tool('get_private_history', { after: 0 });
        context.append('The constraint is retained.');
      }
    });
    await maestro.submit(runId, {
      text: 'The task must support mobile keyboard access.',
      requestId: 'private-15',
    });
    await settle();
    const run = chat.currentRun();
    await chat.configureRun(runId, {
      expectedRevision: run.revision,
      seats: { ...run.seats, a: { ...run.seats.a, model: 'gpt-6.1-sol' } },
    });
    await maestro.submit(runId, {
      text: 'Keep my task constraint while we choose the model.',
      requestId: 'private-16',
    });
    await settle();
    expect(contexts[1].session).toBeUndefined();
    expect(contexts[1].text).toContain('The task must support mobile keyboard access.');
    expect(contexts[1].text).toContain('Keep the mobile accessibility constraint.');
    expect(olderPrivate).toContain('The task must support mobile keyboard access.');
    expect(olderPrivate).not.toContain('Keep my task constraint while we choose the model.');
    expect(JSON.stringify(chat.correspondence(runId, 0, 500))).not.toContain(
      'mobile keyboard access',
    );
  });
});
