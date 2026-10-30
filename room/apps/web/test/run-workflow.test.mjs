import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWorkflow,
  parseTask,
  cleanTask,
  defaultTask,
  canEditWorkflow,
  parseArtifactView,
  parseProviderCatalog,
  parseRunChoices,
} from '../src/lib/run-workflow.ts';

const seats = {
  a: { provider: 'codex', model: 'gpt-6-luna', effort: 'high' },
  b: { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'high' },
};
const task = { ...defaultTask(), question: 'Compare two independent explanations.' };
const artifact = {
  id: 'file-1',
  runId: 'run-1',
  seat: 'a',
  turnId: 'turn-1',
  path: 'report.md',
  title: 'Report',
  sha256: 'a'.repeat(64),
  mimeType: 'text/markdown',
  sourceRevision: 'b'.repeat(40),
  bytes: 100,
  createdAt: 10,
};
const snapshot = {
  runId: 'run-1',
  revision: 3,
  phase: 'ready',
  task,
  seats,
  workspaces: {
    state: 'ready',
    source: { repository: '/work/source', revision: 'b'.repeat(40) },
    seats: { a: { root: '/work/a' }, b: { root: '/work/b' } },
  },
  artifacts: [artifact],
  busy: false,
  retrySeats: [],
};

test('reads a reviewable source commit and keeps setup editable only before work', () => {
  const result = parseWorkflow(snapshot, 'run-1');
  assert.equal(result.workspaces.source.revision, 'b'.repeat(40));
  assert.equal(canEditWorkflow(result), true);
  assert.equal(canEditWorkflow({ ...result, phase: 'independent' }), false);
  assert.equal(canEditWorkflow({ ...result, busy: true }), false);
  assert.notEqual(result.task, task);
  assert.notEqual(result.seats.a, seats.a);
  assert.notEqual(result.artifacts[0], artifact);
});

test('reads saved outputs for relocated workspaces while preventing further edits', () => {
  const moved = {
    ...snapshot,
    workspaces: null,
    workspaceError: 'Open the original installation to manage these workspaces.',
    error: 'An earlier workflow error.',
  };
  const result = parseWorkflow(moved, 'run-1');
  assert.equal(result.workspaceError, moved.workspaceError);
  assert.equal(result.error, moved.error);
  assert.equal(result.phase, 'ready');
  assert.deepEqual(result.artifacts, [artifact]);
  assert.equal(canEditWorkflow(result), false);
  assert.throws(() => parseWorkflow({ ...moved, workspaceError: '' }, 'run-1'));
  assert.throws(() => parseWorkflow({ ...moved, workspaceError: true }, 'run-1'));
  assert.throws(() => parseWorkflow({ ...moved, workspaces: snapshot.workspaces }, 'run-1'));
});

test('rejects another run, unsafe readiness, unresolved source, and invalid task phases', () => {
  for (const change of [
    { runId: 'run-2' },
    { revision: 0 },
    { phase: 'invented' },
    { task: null },
    { workspaces: null },
    { workspaces: { ...snapshot.workspaces, state: 'failed' } },
    {
      workspaces: {
        ...snapshot.workspaces,
        source: { repository: '/work/source', revision: 'HEAD' },
      },
    },
  ])
    assert.throws(() => parseWorkflow({ ...snapshot, ...change }, 'run-1'));
  assert.equal(
    parseWorkflow({ ...snapshot, phase: 'draft', task: null, workspaces: null }, 'run-1').task,
    null,
  );
});

test('cleans shared task fields without altering the source object and bounds work', () => {
  const draft = {
    ...task,
    question: '  Review this  ',
    criteria: [' Evidence ', ''],
    grounding: [' Notes ', ' '],
    source: { repository: ' /repo ', revision: '  ' },
  };
  assert.deepEqual(cleanTask(draft), {
    ...draft,
    question: 'Review this',
    criteria: ['Evidence'],
    grounding: ['Notes'],
    source: { repository: '/repo', revision: 'HEAD' },
  });
  assert.equal(draft.question, '  Review this  ');
  for (const change of [
    { question: ' ' },
    { maxHandoffs: 9 },
    { maxHandoffs: 1.5 },
    { timeLimitSeconds: 29 },
    { timeLimitSeconds: 3601 },
    { mode: 'prototype', profile: 'analysis' },
  ])
    assert.throws(() => parseTask({ ...task, ...change }));
  assert.throws(
    () =>
      cleanTask({
        ...task,
        question: 'x'.repeat(6000),
        grounding: Array(5).fill('x'.repeat(1000)),
      }),
    /10,000/,
  );
});

test('preserves exact subscribed catalog capabilities and rejects third-party choices', () => {
  const catalog = {
    provider: 'codex',
    status: 'ready',
    models: [{ id: 'gpt-6.1-sol', name: 'Sol', efforts: ['low', 'high'] }],
  };
  assert.deepEqual(parseProviderCatalog(catalog), catalog);
  assert.throws(() => parseProviderCatalog({ ...catalog, provider: 'other' }));
  assert.throws(() =>
    parseProviderCatalog({
      ...catalog,
      models: [{ ...catalog.models[0], efforts: ['automatic'] }],
    }),
  );
  assert.throws(() =>
    parseProviderCatalog({ ...catalog, models: [...catalog.models, ...catalog.models] }),
  );
});

test('keeps private proposed model/action data distinct from the applied configuration', () => {
  const proposedSeats = {
    ...seats,
    a: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' },
  };
  const proposal = {
    id: 'action-1',
    kind: 'instruction',
    target: 'both',
    text: 'Check the missing evidence.',
    revision: 3,
    status: 'proposed',
  };
  const result = parseWorkflow({ ...snapshot, proposedSeats, proposal }, 'run-1');
  assert.equal(result.seats.a.model, 'gpt-6-luna');
  assert.equal(result.proposedSeats.a.model, 'gpt-6.1-sol');
  assert.deepEqual(result.proposal, proposal);
  assert.throws(() =>
    parseWorkflow(
      { ...snapshot, proposedSeats: { ...seats, a: { ...seats.a, provider: 'unknown' } } },
      'run-1',
    ),
  );
  assert.throws(() =>
    parseWorkflow({ ...snapshot, proposal: { ...proposal, status: 'auto-applied' } }, 'run-1'),
  );
});

test('binds previews and downloads to a hashed artifact in this run', () => {
  const view = {
    artifact,
    text: '# Report',
    truncated: true,
    downloadUrl: '/api/runs/run-1/artifacts/file-1/download',
  };
  assert.deepEqual(parseArtifactView(view, 'run-1', 'file-1'), view);
  for (const change of [
    { artifact: { ...artifact, runId: 'run-2' } },
    { artifact: { ...artifact, id: 'other' } },
    { artifact: { ...artifact, sha256: 'bad' } },
    { downloadUrl: 'https://example.com/file' },
  ])
    assert.throws(() => parseArtifactView({ ...view, ...change }, 'run-1', 'file-1'));
});

test('retained run selection reads only valid run identities and timestamps', () => {
  const runs = [{ id: 'run-1', revision: 3, state: 'retained', createdAt: 10 }];
  assert.deepEqual(parseRunChoices({ runs, currentRunId: 'run-1' }), runs);
  assert.throws(() =>
    parseRunChoices({ runs: [{ ...runs[0], revision: -1 }], currentRunId: 'run-1' }),
  );
});

test('uses authoritative retry candidates and rejects unreadable retry selections', () => {
  const interrupted = parseWorkflow({ ...snapshot, phase: 'paused', retrySeats: ['b'] }, 'run-1');
  assert.deepEqual(interrupted.retrySeats, ['b']);
  for (const retrySeats of [undefined, null, ['c'], ['a', 'a'], 'both']) {
    assert.throws(() => parseWorkflow({ ...snapshot, retrySeats }, 'run-1'));
  }
});
