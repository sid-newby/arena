import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ChatStore } from '../../../src/chat/chat.store.js';
import type { TaskDraft } from '../../../src/runs/run.contract.js';
import { DEFAULT_MODELS } from '../../../src/runs/run.contract.js';
import { unknownTokens, type Decision } from '../../../src/state/state.contract.js';
const task: TaskDraft = {
  question: 'Shared goal',
  mode: 'reasoning',
  expectedArtifact: '',
  criteria: ['Correct', 'Checked'],
  grounding: [],
  source: null,
  profile: 'analysis',
  maxHandoffs: 1,
  timeLimitSeconds: 60,
};
const decision: Decision = {
  selection: 'a',
  goalStatus: 'solved',
  summary: 'Structured public assessment',
  criteria: [
    { index: 0, result: 'met', evidence: 'A proof' },
    { index: 1, result: 'unknown', evidence: '' },
  ],
};
describe('durable session state', () => {
  let root: string, path: string, chat: ChatStore;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'state-sqlite-'));
    path = join(root, 'chat.sqlite');
    chat = new ChatStore(path, root);
  });
  afterEach(() => {
    chat.close();
    rmSync(root, { recursive: true, force: true });
  });
  const current = () => chat.runs.currentId();
  function legacyFixture() {
    chat.close();
    rmSync(path);
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE agents(id TEXT PRIMARY KEY,session TEXT,pose TEXT,error TEXT);
      INSERT INTO agents VALUES ('luna','old-session','front',NULL);
      CREATE TABLE turns(id TEXT PRIMARY KEY,agent TEXT,request TEXT,prompt TEXT,text TEXT,status TEXT);
      INSERT INTO turns VALUES ('legacy-luna','luna','old-luna-request','old input','old answer','completed');
      INSERT INTO turns VALUES ('legacy-opus','opus','old-opus-request','other input','other answer','completed');
    `);
    db.close();
    chat = new ChatStore(path, root);
  }
  function candidates() {
    for (const seat of ['a', 'b'] as const) {
      chat.create('candidate-' + seat, seat, 'request-' + seat, seat + ' prompt');
      chat.append('candidate-' + seat, seat + ' complete answer');
      chat.finish('candidate-' + seat, 'completed');
    }
    return { a: 'candidate-a', b: 'candidate-b' };
  }
  function source(id = 'maestro-source') {
    const runId = current(),
      throughSeq = chat.runs.cursor(runId);
    chat.runs.state.startAttempt({
      runId,
      turnId: id,
      binding: chat.runs.binding(runId, 'maestro'),
      configRevision: chat.runs.current().revision,
      trigger: 'human',
      stage: null,
      throughSeq,
    });
    return { turnId: id, throughSeq };
  }
  it('keeps accepted attempts and attribution atomic, then preserves unknown versus zero through restart', () => {
    const state = chat.runs.state,
      runId = current();
    const failed = vi.spyOn(state, 'startAttempt').mockImplementationOnce(() => {
      throw new Error('SQLite unavailable');
    });
    expect(() => chat.create('rolled-back', 'a', 'rollback-request', 'prompt')).toThrow(
      'SQLite unavailable',
    );
    expect(chat.find('a', 'rollback-request')).toBeUndefined();
    failed.mockRestore();
    chat.create('known-turn', 'a', 'known-request', 'private input', undefined, 'human', 123);
    const original = chat.runs.binding(runId, 'a');
    state.started('known-turn');
    state.firstText('known-turn');
    const observation = {
      key: 'once',
      source: 'anthropic.result.usage',
      scope: 'turn',
      coverage: 'main-loop',
      completeness: 'partial',
      requestedModel: original.config.model,
      actualModel: null,
      tokens: { ...unknownTokens(), inputTokens: 0 },
      costUsd: null,
      providerDurationMs: null,
    } satisfies import('../../../src/state/state.contract.js').UsageObservation;
    state.usage('known-turn', observation);
    state.usage('known-turn', observation);
    expect(() =>
      state.usage('known-turn', {
        ...observation,
        tokens: { ...observation.tokens, inputTokens: 1 },
      }),
    ).toThrow('identity');
    chat.finish('known-turn', 'failed', 4.25);
    chat.runs.configure(runId, 1, { a: DEFAULT_MODELS.b, b: DEFAULT_MODELS.b }, () => false);
    state.saveBaseline(original.id, 'private-continuation', { ...unknownTokens(), inputTokens: 0 });
    chat.close();
    chat = new ChatStore(path, root);
    const attempt = chat.runs.state.get(runId).attempts[0];
    expect(attempt).toMatchObject({
      bindingId: original.id,
      provider: 'codex',
      model: DEFAULT_MODELS.a.model,
      configRevision: 1,
      status: 'failed',
      requestedAt: 123,
      elapsedMs: 4.25,
      tokens: { inputTokens: 0, totalTokens: null },
      usage: [observation],
    });
    expect(attempt.startedAt).toEqual(expect.any(Number));
    expect(attempt.firstTextAt).toEqual(expect.any(Number));
    expect(attempt.finishedAt).toEqual(expect.any(Number));
    expect(chat.runs.state.baseline(original.id, 'private-continuation')?.inputTokens).toBe(0);
    expect(JSON.stringify(chat.runs.state.get(runId))).not.toContain('private-continuation');
    expect(JSON.stringify(chat.runs.state.get(runId))).not.toContain('private input');
  });
  it('marks crashed attempts and tool metadata interrupted without inventing end times', () => {
    const runId = current();
    chat.create('crashed-turn', 'a', 'crashed-request', 'prompt');
    chat.runs.state.started('crashed-turn');
    chat.runs.state.startTool('crashed-turn', 'read_file');
    chat.close();
    chat = new ChatStore(path, root);
    expect(chat.runs.state.get(runId).attempts[0]).toMatchObject({
      status: 'interrupted',
      finishedAt: null,
      elapsedMs: null,
      tokens: unknownTokens(),
      tools: [{ name: 'read_file', status: 'interrupted', finishedAt: null, elapsedMs: null }],
    });
  });
  it('migrates the current draft and retained binding attribution without inventing old metrics', () => {
    const runId = current();
    chat.runs.workflows.update(runId, { task });
    chat.create('old-turn', 'a', 'old-request', 'old prompt');
    chat.finish('old-turn', 'completed');
    chat.close();
    const db = new DatabaseSync(path);
    for (const name of [
      'state_migrations',
      'state_task_revisions',
      'state_attempts',
      'state_usage_observations',
      'state_tool_calls',
      'state_outcome_revisions',
      'state_commands',
      'state_usage_baselines',
    ])
      db.exec('DROP TABLE ' + name);
    db.close();
    chat = new ChatStore(path, root);
    expect(chat.runs.state.get(runId)).toMatchObject({
      attempts: [
        {
          id: 'old-turn',
          model: DEFAULT_MODELS.a.model,
          provider: DEFAULT_MODELS.a.provider,
          effort: DEFAULT_MODELS.a.effort,
          configRevision: 1,
          status: 'completed',
          origin: 'migration-retained',
          attributionSource: 'recorded-binding',
          originalAuthor: null,
          requestedAt: null,
          startedAt: null,
          finishedAt: null,
          elapsedMs: null,
          tokens: unknownTokens(),
        },
      ],
      taskRevisions: [{ revision: 1, task, origin: 'migration-current' }],
    });
    chat.close();
    chat = new ChatStore(path, root);
    expect(chat.runs.state.get(runId).taskRevisions).toHaveLength(1);
  });
  it('keeps exact legacy identity unknown when the old schema recorded only authors', () => {
    legacyFixture();
    const runId = current();
    expect(chat.runs.state.get(runId).attempts).toMatchObject([
      {
        id: 'legacy-luna',
        bindingId: 'legacy-a',
        originalAuthor: 'Luna',
        instructionsVersion: 'legacy-v0',
        provider: null,
        model: null,
        effort: null,
        configRevision: null,
        attributionSource: 'legacy-author-only',
      },
      {
        id: 'legacy-opus',
        bindingId: 'legacy-b',
        originalAuthor: 'Opus',
        instructionsVersion: 'legacy-v0',
        provider: null,
        model: null,
        effort: null,
        configRevision: null,
        attributionSource: 'legacy-author-only',
      },
    ]);
    expect(chat.history('a')[0]).toMatchObject({ prompt: 'old input', text: 'old answer' });
    expect(chat.history('b')[0]).toMatchObject({ prompt: 'other input', text: 'other answer' });
    chat.close();
    chat = new ChatStore(path, root);
    expect(chat.runs.state.get(runId).attempts).toHaveLength(2);
    expect(chat.runs.state.get(runId).attempts[0]).toMatchObject({
      model: null,
      originalAuthor: 'Luna',
    });
  });
  it.each(['a', 'b'] as const)(
    'rejects legacy seat %s as outcome evidence when its exact model was never recorded',
    (seat) => {
      legacyFixture();
      const runId = current(),
        state = chat.runs.state;
      state.recordTask(runId, task, 'draft-save');
      const candidateTurnIds = candidates(),
        context = source();
      candidateTurnIds[seat] = seat === 'a' ? 'legacy-luna' : 'legacy-opus';
      expect(() =>
        state.propose(runId, context, { taskRevision: 1, candidateTurnIds, decision }),
      ).toThrow('recorded exact model');
      expect(state.outcomes(runId).history).toEqual([]);
    },
  );
  it('requires completed captured candidates and a completed Maestro source before explicit confirmation', () => {
    const runId = current(),
      state = chat.runs.state;
    state.recordTask(runId, task, 'draft-save');
    const candidateTurnIds = candidates(),
      context = source();
    const proposed = state.propose(runId, context, { taskRevision: 1, candidateTurnIds, decision });
    expect(proposed).toMatchObject({
      revision: 1,
      canConfirm: false,
      latestProposal: {
        kind: 'proposed',
        taskRevision: 1,
        sourceMaestroTurnId: context.turnId,
        decision,
        candidates: {
          a: {
            turnId: 'candidate-a',
            model: DEFAULT_MODELS.a.model,
            sha256: createHash('sha256').update('a complete answer').digest('hex'),
          },
        },
      },
      latestConfirmed: null,
    });
    expect(() =>
      state.confirm(runId, 1, { requestId: 'confirm-command', expectedRevision: 1, decision }),
    ).toThrow('incomplete');
    state.finishAttempt(context.turnId, 'completed', 100, 20);
    expect(state.outcomes(runId).canConfirm).toBe(true);
    const edited = {
      ...decision,
      selection: 'combined',
      goalStatus: 'partial',
      summary: 'Human amended recommendation',
    } satisfies Decision;
    const input = { requestId: 'confirm-command', expectedRevision: 1, decision: edited };
    expect(() =>
      state.confirm(runId, 1, {
        ...input,
        requestId: 'missing-confirm-criteria',
        decision: { ...edited, criteria: [] },
      }),
    ).toThrow('every current criterion');
    const confirmed = state.confirm(runId, 1, input);
    expect(confirmed).toMatchObject({
      revision: 2,
      latestConfirmed: { revision: 2, proposalRevision: 1, kind: 'confirmed', decision: edited },
      latestProposal: proposed.latestProposal,
    });
    const next = source('maestro-next');
    state.propose(runId, next, {
      taskRevision: 1,
      candidateTurnIds,
      decision: { ...decision, summary: 'New recommendation' },
    });
    expect(state.outcomes(runId)).toMatchObject({
      revision: 3,
      latestConfirmed: confirmed.latestConfirmed,
      canConfirm: false,
    });
    state.recordTask(runId, { ...task, question: 'Changed goal' }, 'draft-save');
    expect(state.confirm(runId, 1, input)).toEqual(confirmed);
    expect(state.propose(runId, context, { taskRevision: 1, candidateTurnIds, decision })).toEqual(
      proposed,
    );
    expect(() => state.confirm(runId, 1, { ...input, decision })).toThrow(
      'different state command',
    );
    expect(() =>
      state.confirm(runId, 3, { requestId: 'stale-confirm', expectedRevision: 3, decision }),
    ).toThrow('changed');
    chat.close();
    chat = new ChatStore(path, root);
    expect(chat.runs.state.outcomes(runId)).toMatchObject({
      revision: 3,
      latestConfirmed: confirmed.latestConfirmed,
      canConfirm: false,
    });
  });
  it('validates run, seat, task and exact criterion coverage without accepting model-supplied source attribution', () => {
    const runId = current(),
      state = chat.runs.state;
    state.recordTask(runId, task, 'draft-save');
    const ids = candidates(),
      context = source();
    const propose = (decisionInput: unknown, candidateTurnIds = ids) =>
      state.propose(runId, context, { taskRevision: 1, candidateTurnIds, decision: decisionInput });
    expect(() => propose({ ...decision, criteria: [decision.criteria[0]] })).toThrow(
      'every current criterion',
    );
    expect(() =>
      propose({ ...decision, criteria: [decision.criteria[0], decision.criteria[0]] }),
    ).toThrow('every current criterion');
    expect(() =>
      propose({
        ...decision,
        criteria: [{ index: 2, result: 'met', evidence: '' }, decision.criteria[0]],
      }),
    ).toThrow('every current criterion');
    expect(() => propose({ ...decision, selection: 'not-a-choice' })).toThrow(
      'Invalid state command',
    );
    expect(() => propose(decision, { a: ids.b, b: ids.a })).toThrow('Candidates');
    const other = chat.runs.create(),
      otherStore = chat.forRun(other.id);
    otherStore.create('other-candidate', 'a', 'other-request', 'other');
    otherStore.finish('other-candidate', 'completed');
    expect(() => propose(decision, { ...ids, a: 'other-candidate' })).toThrow('Candidates');
    expect(() =>
      state.propose(
        runId,
        { ...context, throughSeq: 0 },
        { taskRevision: 1, candidateTurnIds: ids, decision },
      ),
    ).toThrow('boundary');
    expect(() =>
      state.propose(runId, context, {
        taskRevision: 1,
        candidateTurnIds: ids,
        decision,
        sourceMaestroTurnId: 'forged',
      }),
    ).toThrow('Invalid state command');
    expect(() =>
      state.propose(runId, context, { taskRevision: 2, candidateTurnIds: ids, decision }),
    ).toThrow('task revision');
    const proposed = propose(decision);
    state.finishAttempt(context.turnId, 'stopped');
    expect(state.outcomes(runId).canConfirm).toBe(false);
    expect(() =>
      state.confirm(other.id, proposed.revision, {
        requestId: 'wrong-run-confirm',
        expectedRevision: 0,
        decision,
      }),
    ).toThrow('changed');
  });
  it('rejects candidates completed after the captured evidence boundary and retained-run changes', () => {
    const runId = current(),
      state = chat.runs.state;
    state.recordTask(runId, task, 'draft-save');
    const context = source();
    const ids = candidates();
    expect(() =>
      state.propose(runId, context, { taskRevision: 1, candidateTurnIds: ids, decision }),
    ).toThrow('boundary');
    const retained = chat.runs.create('legacy');
    expect(() =>
      state.startAttempt({
        runId: retained.id,
        turnId: 'retained-attempt',
        binding: chat.runs.binding(retained.id, 'maestro'),
        configRevision: 1,
        trigger: 'human',
        stage: null,
      }),
    ).toThrow('read-only');
    expect(state.outcomes(retained.id).canConfirm).toBe(false);
  });
  it('paginates complete attempt storage beyond chat snapshots', () => {
    const runId = current();
    for (let i = 0; i < 105; i++) {
      chat.create(`turn-${i}`, 'a', `request-${i}`, 'prompt');
      chat.finish(`turn-${i}`, 'completed');
    }
    expect(chat.snapshot('a').messages).toHaveLength(100);
    expect(chat.runs.state.get(runId, 0, 100)).toMatchObject({
      attempts: expect.any(Array),
      nextOffset: 100,
    });
    expect(chat.runs.state.get(runId, 100, 100).attempts).toHaveLength(5);
    expect(() => chat.runs.state.get(runId, 0, 501)).toThrow('limit');
  });
});
