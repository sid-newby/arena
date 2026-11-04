import { DebateService } from '../../../src/debate/debate.service.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatStore } from '../../../src/chat/chat.store.js';
import { ChatService } from '../../../src/chat/chat.service.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import { UnconfirmedCancellationError } from '../../../src/chat/runtime-cancellation.js';
import type { ParticipantBinding } from '../../../src/runs/run.contract.js';
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};
describe('Durable seat messages', () => {
  let root: string, store: ChatStore, chat: ChatService, runId: string;
  const runs: { context: TurnContext; release: () => void }[] = [];
  let uncertain = false,
    holdCancellation = false;
  const factoryWorkspaces: string[] = [];
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'room-messages-'));
    store = new ChatStore(join(root, 'chat.sqlite'), root);
    runId = store.runs.currentId();
    runs.length = 0;
    uncertain = false;
    holdCancellation = false;
    factoryWorkspaces.length = 0;
    const factory = (binding: ParticipantBinding): AgentRuntime => {
      factoryWorkspaces.push(binding.workspace);
      return {
        info: {
          id: binding.role,
          name: binding.role,
          ...binding.config,
          runtime: 'fixture',
          status: 'ready',
        },
        run: async (context) => {
          context.append('Partial output.');
          await new Promise<void>((resolve) => {
            runs.push({ context, release: resolve });
            context.controller.signal.addEventListener(
              'abort',
              () => {
                if (!holdCancellation) resolve();
              },
              { once: true },
            );
          });
          if (context.controller.signal.aborted && uncertain)
            throw new UnconfirmedCancellationError();
          if (!context.controller.signal.aborted) context.append(' Finished.');
        },
      };
    };
    chat = ChatService.forTest(
      store,
      { a: factory(store.runs.binding(runId, 'a')), b: factory(store.runs.binding(runId, 'b')) },
      root,
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
  });
  it('passes only fresh completed public peer remarks into the next Sid turn without waking the other seat', async () => {
    const room = chat.hangout();
    const broadcast = (seat: 'a' | 'b', text: string, id: string) =>
      chat.submitMessage(
        seat,
        {
          text,
          broadcastId: id,
          requestId: id + '-' + seat,
          expectedRevision: room.revision,
          intent: 'queue',
        },
        room.id,
      );
    broadcast('a', 'Which finish would you pick?', 'public-first');
    broadcast('b', 'Which finish would you pick?', 'public-first');
    await settle();
    expect(runs).toHaveLength(2);
    runs[0].context.append('A matte orange finish.');
    runs[1].context.append('My own answer.');
    runs[0].release();
    runs[1].release();
    await settle();

    chat.submitSide(room.id, 'a', {
      requestId: 'private-side-note',
      text: 'Private design question.',
      expectedRevision: room.revision,
    });
    await settle();
    runs[2].context.append('A private answer.');
    runs[2].release();
    await settle();
    // A stopped main turn can have text on screen, but it is not a completed remark.
    broadcast('a', 'One last thought?', 'public-stopped');
    await settle();
    runs[3].context.append('Abandoned partial.');
    await chat.stop('a', room.id);
    broadcast('b', 'What do you think of that?', 'public-followup');
    await settle();
    expect(runs).toHaveLength(5);
    const followup = runs[4].context;
    expect(followup.text).toContain('"speaker":"Astra"');
    expect(followup.text).toContain('A matte orange finish.');
    expect(followup.text).toContain('Sid’s current message:\nWhat do you think of that?');
    expect(followup.text).not.toMatch(
      /My own answer|private design|private answer|Abandoned partial/i,
    );
    expect(followup.instructions).not.toContain('matte orange');
    expect(store.messaging.find(room.id, 'b', 'public-followup-b')?.text).toBe(
      'What do you think of that?',
    );
    runs[4].release();
    await settle();
    broadcast('b', 'Anything else?', 'public-followup-later');
    await settle();
    expect(runs[5].context.text).toBe('Sid’s current message:\nAnything else?');
  });
  it('lets a participant go quiet, leave until invited, and return with the same voice preference', async () => {
    const hangout = chat.hangout();
    const broadcast = (seat: 'a' | 'b', label: string) =>
      chat.submitMessage(
        seat,
        {
          text: label,
          broadcastId: label,
          requestId: label + '-' + seat,
          expectedRevision: hangout.revision,
          intent: 'queue',
        },
        hangout.id,
      );
    broadcast('a', 'initial-room-post');
    await settle();
    const astra = runs[0].context;
    await astra.tool('summarize_speech', { text: 'Before I went quiet.' });
    await astra.tool('set_voice', { enabled: false });
    broadcast('a', 'queued-before-leaving');
    await astra.tool('leave_room', {});
    await expect(astra.tool('set_voice', { enabled: true })).rejects.toThrow(/away/);
    runs[0].release();
    await settle();
    expect(chat.hangoutPresence()).toEqual({
      a: { present: false, voiceEnabled: false },
      b: { present: true, voiceEnabled: true },
    });
    expect(chat.snapshot('a', hangout.id).messages[0].narration).toEqual({ status: 'quiet' });
    expect(store.messaging.find(hangout.id, 'a', 'queued-before-leaving-a')?.status).toBe(
      'cancelled',
    );
    expect(() => broadcast('a', 'while-away')).toThrow(/away/);
    expect(() =>
      chat.submitSide(hangout.id, 'a', {
        text: 'Hello?',
        requestId: 'while-away',
        expectedRevision: hangout.revision,
      }),
    ).toThrow(/away/);
    broadcast('b', 'while-away');
    await settle();
    const fable = runs[1].context;
    await expect(fable.tool('address_panelist', { recipient: 'a' })).rejects.toThrow(/away/);
    await fable.tool('summarize_speech', { text: 'My own voice is on.' });
    runs[1].release();
    await settle();
    expect(chat.snapshot('b', hangout.id).messages[0].narration?.status).toBe('ready');
    const reopened = new ChatStore(join(root, 'chat.sqlite'), root);
    try {
      expect(reopened.presence.get(reopened.runs.binding(hangout.id, 'a'))).toEqual({
        present: false,
        voiceEnabled: false,
      });
    } finally {
      reopened.close();
    }
    expect(chat.inviteHangout('a').a).toEqual({ present: true, voiceEnabled: false });
    await settle();
    expect(runs).toHaveLength(2);
    broadcast('a', 'after-invitation');
    await settle();
    const returned = runs[2].context;
    expect(await returned.tool('summarize_speech', { text: 'Still quiet.' })).toBe(
      'Your voice is off.',
    );
    await returned.tool('set_voice', { enabled: true });
    await returned.tool('summarize_speech', { text: 'Back again.' });
    runs[2].release();
    await settle();
    expect(chat.snapshot('a', hangout.id).messages.at(-1)?.narration).toMatchObject({
      status: 'ready',
      segments: ['Back again.'],
    });
  });
  afterEach(async () => {
    uncertain = false;
    await chat.onModuleDestroy();
    rmSync(root, { recursive: true, force: true });
  });
  const send = (
    text: string,
    intent: 'send' | 'queue' | 'interrupt' = 'queue',
    requestId = 'request-' + text,
  ) =>
    chat.submitMessage(
      'a',
      { text, intent, requestId, expectedRevision: chat.run(runId).revision },
      runId,
    );
  it('acknowledges immediately and dispatches queued input FIFO from terminal events', async () => {
    const first = send('first');
    expect(first.status).toBe('queued');
    await settle();
    send('second');
    send('third');
    expect(runs).toHaveLength(1);
    runs[0].release();
    await settle();
    expect(runs).toHaveLength(2);
    expect(runs[1].context.text).toBe('second');
    runs[1].release();
    await settle();
    expect(runs).toHaveLength(3);
    expect(runs[2].context.text).toBe('third');
    expect(chat.snapshot('a', runId).humanMessages?.map((v) => v.status)).toEqual([
      'completed',
      'completed',
      'running',
    ]);
  });
  it('deduplicates intent and content and cancels queued messages', async () => {
    const first = send('first');
    expect(send('first').id).toBe(first.id);
    expect(() => send('first', 'interrupt')).toThrow('different');
    const second = send('second');
    chat.cancelMessage('a', runId, second.id);
    await settle();
    expect(runs).toHaveLength(1);
    expect(chat.snapshot('a', runId).humanMessages?.[1].status).toBe('cancelled');
  });
  it('records a single broadcast identity across acknowledged seats and preserves turn authorship', async () => {
    const broadcastId = 'broadcast-identity';
    for (const seat of ['a', 'b'] as const) {
      const input = {
        broadcastId,
        requestId: `${broadcastId}-${seat}`,
        text: 'Compare your observations',
        expectedRevision: chat.run(runId).revision,
        intent: 'queue',
      };
      const first = chat.submitMessage(seat, input, runId);
      expect(chat.submitMessage(seat, input, runId).id).toBe(first.id);
    }
    await settle();
    for (const run of runs) run.release();
    await settle();
    const events = store.runs.correspondence(runId);
    expect(
      events.filter((event) => event.kind === 'message.queued').map((event) => event.payload),
    ).toMatchObject([
      { broadcastId, requestId: `${broadcastId}-a`, seat: 'a' },
      { broadcastId, requestId: `${broadcastId}-b`, seat: 'b' },
    ]);
    expect(
      events.filter((event) => event.kind === 'human.prompt').map((event) => event.payload.trigger),
    ).toEqual(['intervention', 'intervention']);
    for (const seat of ['a', 'b'] as const) {
      const { provider, model } = store.runs.binding(runId, seat).config;
      expect(
        events.find((event) => event.kind === 'turn.finished' && event.role === seat)?.payload,
      ).toMatchObject({
        status: 'completed',
        text: 'Partial output. Finished.',
        provider,
        model,
        addressedTo: null,
      });
    }
  });
  it('interrupts before replacement and preserves partial text', async () => {
    send('first');
    await settle();
    const receipt = send('correction', 'interrupt');
    expect(receipt.status).toBe('queued');
    expect(runs).toHaveLength(1);
    await settle();
    expect(runs[0].context.controller.signal.aborted).toBe(true);
    expect(runs).toHaveLength(2);
    expect(chat.snapshot('a', runId).messages[0]).toMatchObject({
      text: 'Partial output.',
      status: 'stopped',
    });
  });
  it('Stop fences an interrupt waiting for cancellation and cancels queued work', async () => {
    send('first');
    await settle();
    send('correction', 'interrupt');
    send('later');
    await chat.stop('a', runId);
    await settle();
    expect(runs).toHaveLength(1);
    expect(chat.snapshot('a', runId).humanMessages?.map((v) => v.status)).toEqual([
      'stopped',
      'cancelled',
      'cancelled',
    ]);
  });
  it('blocks replacement after unconfirmed cancellation until explicit resolution', async () => {
    send('first');
    await settle();
    uncertain = true;
    const correction = send('correction', 'interrupt');
    await settle();
    expect(runs).toHaveLength(1);
    expect(store.messaging.get(correction.id, runId, 'a').status).toBe('uncertain');
    send('later');
    await settle();
    expect(runs).toHaveLength(1);
    for (const message of store.messaging.list(runId, 'a'))
      if (message.status === 'uncertain') chat.cancelMessage('a', runId, message.id);
    await settle();
    expect(runs).toHaveLength(2);
    expect(runs[1].context.text).toBe('later');
  });
  it('stopping A cannot strand an interrupt waiting on B cancellation', async () => {
    chat.submitMessage(
      'b',
      {
        text: 'B first',
        requestId: 'request-b-first',
        intent: 'queue',
        expectedRevision: chat.run(runId).revision,
      },
      runId,
    );
    await settle();
    holdCancellation = true;
    chat.submitMessage(
      'b',
      {
        text: 'B correction',
        requestId: 'request-b-correction',
        intent: 'interrupt',
        expectedRevision: chat.run(runId).revision,
      },
      runId,
    );
    await settle();
    expect(runs[0].context.controller.signal.aborted).toBe(true);
    await chat.stop('a', runId);
    runs[0].release();
    await settle();
    holdCancellation = false;
    expect(runs).toHaveLength(2);
    expect(runs[1].context.text).toBe('B correction');
  });
  it('global Stop signals main and side cancellation before waiting on either', async () => {
    send('main');
    await settle();
    chat.submitSide(runId, 'a', {
      requestId: 'side-slow-stop',
      text: 'Side work',
      expectedRevision: chat.run(runId).revision,
    });
    await settle();
    holdCancellation = true;
    const stopped = chat.stopConversation(runId);
    await settle();
    expect(runs[0].context.controller.signal.aborted).toBe(true);
    expect(runs[1].context.controller.signal.aborted).toBe(true);
    runs[0].release();
    runs[1].release();
    holdCancellation = false;
    await stopped;
  });
  it('explicit Resume reapproves a paused queue without changing its retry fingerprint', async () => {
    const debate = DebateService.forTest(
      chat,
      new WorkspaceManager({ controlRoot: join(root, 'control') }),
    );
    try {
      let value = debate.saveTask(runId, {
        expectedRevision: chat.run(runId).revision,
        task: {
          question: 'Task',
          mode: 'reasoning',
          expectedArtifact: 'Report',
          criteria: ['Correct'],
          grounding: [],
          source: null,
          profile: 'analysis',
          maxHandoffs: 1,
          timeLimitSeconds: 60,
        },
      });
      value = await debate.prepare(runId, { expectedRevision: value.revision });
      expect(value.phase).toBe('ready');
      expect(() => send('before-start')).toThrow('not open');
      value = await debate.start(runId, {
        expectedRevision: value.revision,
        requestId: 'start-task-message',
      });
      await settle();
      const acceptedRevision = chat.run(runId).revision;
      const queued = send('after-pause');
      debate.pause(runId, { expectedRevision: acceptedRevision });
      runs[0].release();
      runs[1].release();
      await settle();
      value = debate.snapshot(runId);
      expect(value.phase).toBe('paused');
      expect(value.busy).toBe(false);
      expect(runs).toHaveLength(2);
      await debate.resume(runId, {
        expectedRevision: value.revision,
        requestId: 'resume-task-message',
      });
      await settle();
      expect(runs).toHaveLength(3);
      expect(runs[2].context.text).toBe('after-pause');
      const retry = chat.submitMessage(
        'a',
        {
          text: 'after-pause',
          requestId: 'request-after-pause',
          intent: 'queue',
          expectedRevision: acceptedRevision,
        },
        runId,
      );
      expect(retry.id).toBe(queued.id);
      expect(retry.revision).toBe(acceptedRevision);
    } finally {
      debate.onModuleDestroy();
    }
  });
  it('runs read-only side consultation from an independent cwd after the retained workspace disappears', async () => {
    store.runs.attachWorkspaces(
      runId,
      chat.run(runId).revision,
      { a: join(root, 'removed-a'), b: join(root, 'removed-b') },
      'analysis',
      () => {},
    );
    chat.submitSide(runId, 'a', {
      requestId: 'side-cleaned-workspace',
      text: 'Explain previous results.',
      expectedRevision: chat.run(runId).revision,
    });
    await settle();
    expect(runs).toHaveLength(1);
    expect(runs[0].context.mode).toBe('side');
    expect(existsSync(factoryWorkspaces.at(-1)!)).toBe(true);
    expect(factoryWorkspaces.at(-1)).toContain('side-conversations');
  });
  it('preserves undispatched input during a graceful server restart', async () => {
    send('first');
    await settle();
    send('later');
    await chat.onModuleDestroy();
    const reopened = new ChatStore(join(root, 'chat.sqlite'), root);
    expect(reopened.messaging.list(runId, 'a').map((v) => v.status)).toEqual(['stopped', 'queued']);
    reopened.close();
  });
  it('does not reuse an unconfirmed side continuation and retains completed private context', async () => {
    chat.submitSide(runId, 'a', {
      requestId: 'side-known-complete',
      text: 'Earlier side question',
      expectedRevision: chat.run(runId).revision,
    });
    await settle();
    runs[0].release();
    await settle();
    chat.submitSide(runId, 'a', {
      requestId: 'side-unknown-cancel',
      text: 'Unconfirmed side work',
      expectedRevision: chat.run(runId).revision,
    });
    await settle();
    runs[1].context.saveSession('uncertain-side-session', 6);
    uncertain = true;
    await chat.stopSide(runId, 'a');
    expect(chat.sideSnapshot(runId, 'a').messages.at(-1)?.status).toBe('failed');
    expect(chat.sideSnapshot(runId, 'a').error).toContain('did not acknowledge');
    uncertain = false;
    chat.submitSide(runId, 'a', {
      requestId: 'side-fresh-resend',
      text: 'Continue safely',
      expectedRevision: chat.run(runId).revision,
    });
    await settle();
    expect(runs[2].context.session).toBeUndefined();
    expect(runs[2].context.instructions).not.toContain('Earlier side question');
    expect(runs[2].context.text).toContain('Earlier side question');
    expect(runs[2].context.text).not.toContain('Unconfirmed side work');
    expect(runs[2].context.instructions).not.toContain('Unconfirmed side work');
  });
  it('isolates side sessions, text and tools while main work continues', async () => {
    send('main');
    await settle();
    chat.submitSide(runId, 'a', {
      requestId: 'side-request-one',
      text: 'Private question.',
      expectedRevision: chat.run(runId).revision,
    });
    chat.submitSide(runId, 'a', {
      requestId: 'side-request-two',
      text: 'Next private question.',
      expectedRevision: chat.run(runId).revision,
    });
    await settle();
    expect(runs).toHaveLength(2);
    expect(runs[1].context.mode).toBe('side');
    expect(runs[1].context.tools).toEqual([]);
    runs[1].context.saveSession('separate-session', 6);
    expect(store.runs.session(store.runs.binding(runId, 'a').id)).toBeUndefined();
    expect(chat.snapshot('a', runId).messages).toHaveLength(1);
    expect(
      chat
        .correspondence(runId)
        .events.some((event) => JSON.stringify(event.payload).includes('Private question.')),
    ).toBe(false);
    runs[1].release();
    await settle();
    expect(runs).toHaveLength(3);
    expect(runs[2].context.text).toBe('Next private question.');
    await chat.stopSide(runId, 'a');
    expect(runs[0].context.controller.signal.aborted).toBe(false);
  });
});
describe('Committed event delivery and restart', () => {
  it('drains all initial and coalesced correspondence pages without a polling timer', async () => {
    const store = new ChatStore(':memory:', '/tmp');
    const runId = store.runs.currentId();
    const binding = store.runs.binding(runId, 'a');
    const runtime: AgentRuntime = {
      info: { id: 'a', name: 'A', ...binding.config, runtime: 'fixture', status: 'ready' },
      run: async () => {},
    };
    const chat = ChatService.forTest(store, { a: runtime, b: runtime }, '/tmp');
    await settle();
    for (let i = 0; i < 1201; i++) store.runs.append(runId, 'probe.initial', null, null, { i });
    const initialThrough = store.runs.cursor(runId),
      received: number[] = [];
    let inserted = false;
    const subscription = chat.correspondenceEvents(runId).subscribe(({ id }) => {
      received.push(Number(id));
      if (!inserted) {
        inserted = true;
        store.runs.append(runId, 'probe.live-during-replay', null, null, {});
      }
    });
    expect(received).toEqual(Array.from({ length: initialThrough }, (_, i) => i + 1));
    await settle();
    expect(received).toEqual(Array.from({ length: initialThrough + 1 }, (_, i) => i + 1));
    for (let i = 0; i < 1101; i++) store.runs.append(runId, 'probe.coalesced', null, null, { i });
    await settle();
    const through = store.runs.cursor(runId);
    expect(received).toEqual(Array.from({ length: through }, (_, i) => i + 1));
    subscription.unsubscribe();
    await chat.onModuleDestroy();
  });
  it('retains an earlier committed notification when the next transaction rolls back', async () => {
    const store = new ChatStore(':memory:', '/tmp');
    const first = store.runs.currentId(),
      second = store.runs.create().id;
    await settle();
    const observed: string[] = [];
    const unsubscribe = store.onCommit((id) => observed.push(id));
    store.runs.append(first, 'test.committed', null, null, {});
    expect(() =>
      store.runs.revise(second, store.runs.get(second).revision, () => {
        store.runs.append(second, 'test.rolled-back', null, null, {});
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    await settle();
    expect(observed).toEqual([first]);
    expect(store.runs.correspondence(second).some((row) => row.kind === 'test.rolled-back')).toBe(
      false,
    );
    unsubscribe();
    store.close();
  });
  it('preserves queued input and recovers dispatched input as uncertain', () => {
    const root = mkdtempSync(join(tmpdir(), 'room-message-recovery-')),
      path = join(root, 'chat.sqlite');
    let store = new ChatStore(path, root);
    const runId = store.runs.currentId(),
      binding = store.runs.binding(runId, 'a');
    const first = store.messaging.create({
      runId,
      seat: 'a',
      bindingId: binding.id,
      revision: 1,
      intent: 'queue',
      requestId: 'recovery-first',
      text: 'first',
    });
    store.forRun(runId).create('old-turn', 'a', 'recovery-first', 'first');
    store.messaging.update(first, 'running', { turnId: 'old-turn' });
    store.messaging.create({
      runId,
      seat: 'a',
      bindingId: binding.id,
      revision: 1,
      intent: 'queue',
      requestId: 'recovery-next',
      text: 'next',
    });
    store.close();
    store = new ChatStore(path, root);
    expect(store.messaging.list(runId, 'a').map((v) => v.status)).toEqual(['uncertain', 'queued']);
    expect(store.messaging.next(runId, 'a')).toBeUndefined();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  it('does not replay queued side input behind an unconfirmed reply after restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'room-side-recovery-')),
      path = join(root, 'chat.sqlite');
    let store = new ChatStore(path, root);
    const runId = store.runs.currentId(),
      binding = store.runs.binding(runId, 'a');
    store.side.session(binding, 'checkpoint');
    const first = store.side.enqueue(binding, 1, 'side-recovery-first', 'first');
    store.side.enqueue(binding, 1, 'side-recovery-next', 'next');
    store.side.update(binding, first, 'streaming');
    store.side.saveSession(binding.id, 'old-unconfirmed-session', 6);
    store.close();
    store = new ChatStore(path, root);
    expect(store.side.list(binding.id).map((v) => v.status)).toEqual(['failed', 'failed']);
    expect(store.side.session(binding, '').continuation).toBeNull();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  it('waits until policy attachment and module initialization before recovering a main queue', async () => {
    const store = new ChatStore(':memory:', '/tmp');
    const runId = store.runs.currentId(),
      binding = store.runs.binding(runId, 'a');
    let calls = 0;
    store.messaging.create({
      runId,
      seat: 'a',
      bindingId: binding.id,
      revision: 1,
      intent: 'queue',
      requestId: 'startup-queued-request',
      text: 'pending',
    });
    const runtime: AgentRuntime = {
      info: { id: 'a', name: 'A', ...binding.config, runtime: 'fixture', status: 'ready' },
      run: async () => {
        calls++;
      },
    };
    const chat = ChatService.forTest(store, { a: runtime, b: runtime }, '/tmp', {
      initialize: false,
    });
    await settle();
    expect(calls).toBe(0);
    const debate = DebateService.forTest(
      chat,
      new WorkspaceManager({ controlRoot: join(tmpdir(), 'room-startup-policy-' + runId) }),
    );
    store.runs.workflows.update(runId, {
      task: {
        question: 'closed',
        mode: 'reasoning',
        expectedArtifact: 'none',
        criteria: [],
        grounding: [],
        source: null,
        profile: 'analysis',
        maxHandoffs: 0,
        timeLimitSeconds: 60,
      },
      phase: 'completed',
    });
    chat.onModuleInit();
    await settle();
    expect(calls).toBe(0);
    expect(store.messaging.list(runId, 'a')[0].status).toBe('queued');
    debate.onModuleDestroy();
    await chat.onModuleDestroy();
  });
});
