import test from 'node:test';
import assert from 'node:assert/strict';
import { startDebate, isSimpleDebate } from '../src/lib/start-debate.ts';
import { defaultTask } from '../src/lib/run-workflow.ts';

const seats = {
  a: { provider: 'codex', model: 'gpt-6-luna', effort: 'high' },
  b: { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'high' },
};
const task = {
  ...defaultTask(),
  question: 'What does the evidence support?',
  evidenceFolder: '/work/evidence',
};
const workspace = {
  state: 'ready',
  source: null,
  seats: { a: { root: '/work/a' }, b: { root: '/work/b' } },
};
const snapshot = (change = {}) => ({
  runId: 'run-one',
  revision: 1,
  phase: 'draft',
  task: null,
  seats,
  workspaces: null,
  artifacts: [],
  retrySeats: [],
  busy: false,
  ...change,
});

function fixture(initial = snapshot()) {
  let saved = structuredClone(initial);
  const calls = [];
  const identities = new Map();
  const checkpoints = [];
  const revisions = [];
  const options = {
    baseline: initial,
    expectedRevision: initial.revision,
    task,
    seats,
    signal: new AbortController().signal,
    identity: (action, revision) => {
      const key = `${action}:${revision}`;
      if (!identities.has(key)) identities.set(key, `id-${key}`);
      return identities.get(key);
    },
    assertCurrent: () => {},
    onSaved: (value) => checkpoints.push(value),
    onRevision: (value) => revisions.push(value),
    onProgress: () => {},
    request: async (runId, path, parse, body) => {
      assert.equal(runId, 'run-one');
      calls.push({ path, body });
      if (path === '/workflow') return parse(saved);
      assert.equal(body.expectedRevision, saved.revision, `stale revision at ${path}`);
      if (path === '/configurations') {
        saved = { ...saved, revision: saved.revision + 1, seats: body.seats };
        return parse({ id: runId, revision: saved.revision });
      }
      if (path === '/task')
        saved = { ...saved, task: body.task, revision: saved.revision + 1, phase: 'draft' };
      if (path === '/prepare')
        saved = { ...saved, revision: saved.revision + 2, phase: 'ready', workspaces: workspace };
      if (path === '/start')
        saved = { ...saved, revision: saved.revision + 1, phase: 'independent', busy: true };
      return parse(saved);
    },
  };
  return {
    calls,
    checkpoints,
    revisions,
    options,
    get saved() {
      return saved;
    },
    set saved(value) {
      saved = value;
    },
  };
}

test('one start action saves selected models and folder, prepares, then starts using returned revisions', async () => {
  const run = fixture();
  const result = await startDebate({
    ...run.options,
    seats: { ...seats, a: { ...seats.a, effort: 'medium' } },
  });
  assert.equal(result.phase, 'independent');
  assert.deepEqual(
    run.calls.map(({ path }) => path),
    ['/workflow', '/configurations', '/task', '/prepare', '/start'],
  );
  assert.deepEqual(
    run.calls.filter(({ body }) => body).map(({ body }) => body.expectedRevision),
    [1, 2, 3, 5],
  );
  assert.equal(run.calls[2].body.task.evidenceFolder, '/work/evidence');
  assert.equal(run.calls[4].body.requestId, 'id-start:5');
  assert.deepEqual(run.revisions, [2]);
});

test('a lost prepare response retries from the ready snapshot without preparing a second time', async () => {
  const run = fixture();
  const request = run.options.request;
  let lost = true;
  run.options.request = async (...args) => {
    const result = await request(...args);
    if (args[1] === '/prepare' && lost) {
      lost = false;
      throw new Error('connection lost');
    }
    return result;
  };
  await assert.rejects(startDebate(run.options), /connection lost/);
  assert.equal(run.saved.phase, 'ready');
  await startDebate(run.options);
  assert.equal(run.calls.filter(({ path }) => path === '/prepare').length, 1);
  assert.equal(run.calls.filter(({ path }) => path === '/start').length, 1);
});

test('lost model and task save responses reconcile exact committed settings on retry', async () => {
  for (const lostPath of ['/configurations', '/task']) {
    const run = fixture();
    const request = run.options.request;
    run.options.seats = { ...seats, a: { ...seats.a, effort: 'medium' } };
    let lost = true;
    run.options.request = async (...args) => {
      const result = await request(...args);
      if (args[1] === lostPath && lost) {
        lost = false;
        throw new Error('connection lost');
      }
      return result;
    };
    await assert.rejects(startDebate(run.options), /connection lost/);
    await startDebate(run.options);
    assert.equal(run.calls.filter(({ path }) => path === lostPath).length, 1);
    assert.equal(run.calls.filter(({ path }) => path === '/start').length, 1);
  }
});

test('a lost start response never redispatches work after reconnect', async () => {
  const run = fixture();
  const request = run.options.request;
  run.options.request = async (...args) => {
    const result = await request(...args);
    if (args[1] === '/start') throw new Error('response lost');
    return result;
  };
  await assert.rejects(startDebate(run.options), /response lost/);
  const result = await startDebate(run.options);
  assert.equal(result.phase, 'independent');
  assert.equal(run.calls.filter(({ path }) => path === '/start').length, 1);
});

test('a failed folder preparation can be fixed and started in the same run', async () => {
  const run = fixture(
    snapshot({
      revision: 4,
      phase: 'failed',
      task: { ...task, evidenceFolder: '/missing' },
      error: 'Folder missing.',
    }),
  );
  const result = await startDebate(run.options);
  assert.equal(result.phase, 'independent');
  assert.deepEqual(
    run.calls.map(({ path }) => path),
    ['/workflow', '/task', '/prepare', '/start'],
  );
  assert.equal(run.calls[1].body.task.evidenceFolder, task.evidenceFolder);
});

test('preparation failures and a superseded run lease cannot reach inference', async () => {
  const run = fixture();
  const request = run.options.request;
  run.options.request = async (...args) => {
    if (args[1] === '/prepare')
      return snapshot({ revision: 4, phase: 'failed', task, error: 'Evidence folder missing.' });
    return request(...args);
  };
  await assert.rejects(startDebate(run.options), /Evidence folder missing/);
  assert.equal(
    run.calls.some(({ path }) => path === '/start'),
    false,
  );
  const changed = fixture();
  await assert.rejects(
    startDebate({
      ...changed.options,
      assertCurrent: () => {
        throw new Error('run changed');
      },
    }),
    /run changed/,
  );
  assert.deepEqual(
    changed.calls.map(({ path }) => path),
    ['/workflow'],
  );
});

test('unrelated saved changes and frozen folder changes require explicit review or a new run', async () => {
  const run = fixture();
  run.saved = snapshot({
    revision: 5,
    task: { ...task, question: 'Someone else changed the question.' },
  });
  await assert.rejects(startDebate(run.options), /saved run changed/);
  assert.deepEqual(
    run.calls.map(({ path }) => path),
    ['/workflow'],
  );
  const frozen = fixture(snapshot({ phase: 'ready', task, workspaces: workspace }));
  await assert.rejects(
    startDebate({ ...frozen.options, task: { ...task, evidenceFolder: '/other' } }),
    /frozen/,
  );
  assert.deepEqual(
    frozen.calls.map(({ path }) => path),
    ['/workflow'],
  );
});

test('equivalent settings with reordered object keys do not resave or reprepare', async () => {
  const run = fixture(snapshot({ phase: 'ready', task, workspaces: workspace }));
  const reordered = Object.fromEntries(Object.entries(task).toReversed());
  const result = await startDebate({ ...run.options, task: reordered });
  assert.equal(result.phase, 'independent');
  assert.deepEqual(
    run.calls.map(({ path }) => path),
    ['/workflow', '/start'],
  );
  assert.equal(
    isSimpleDebate({ ...task, source: { repository: '/git', revision: 'HEAD' } }),
    false,
  );
  assert.equal(isSimpleDebate({ ...task, profile: 'build' }), false);
});
