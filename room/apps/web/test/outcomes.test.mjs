import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeRequest, parseOutcome } from '../src/lib/outcomes.ts';

const decision = {
  selection: 'a',
  goalStatus: 'partial',
  summary: 'Evidence reviewed',
  criteria: [{ index: 0, result: 'met', evidence: 'The output includes it.' }],
};
const candidate = {
  turnId: 'turn',
  bindingId: 'binding',
  provider: 'codex',
  model: 'model-full-id',
  sha256: 'hash',
};
const proposal = {
  revision: 1,
  kind: 'proposed',
  proposalRevision: null,
  sourceMaestroTurnId: 'maestro',
  taskRevision: 1,
  decision,
  candidates: { a: candidate, b: candidate },
  createdAt: 10,
};
const snapshot = {
  runId: 'run-one',
  revision: 1,
  task: { revision: 1, criteria: ['Criterion'] },
  latestProposal: proposal,
  latestConfirmed: null,
  canConfirm: true,
  history: [proposal],
};

test('a confirmation sends the reviewed amendments with the proposal and expected revision', async () => {
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify(snapshot));
  };
  try {
    const amended = { ...decision, selection: 'b', summary: 'User amendment' };
    await outcomeRequest('run-one', '/1/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'request', expectedRevision: 1, decision: amended }),
    });
    assert.equal(captured.url, '/api/runs/run-one/state/outcomes/1/confirm');
    assert.deepEqual(JSON.parse(captured.options.body), {
      requestId: 'request',
      expectedRevision: 1,
      decision: amended,
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('a response for a different run cannot be accepted', () => {
  assert.throws(() => parseOutcome(snapshot, 'run-two'), /could not be read/);
});

test('a stale confirmation reports an actionable conflict', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 409 });
  try {
    await assert.rejects(
      outcomeRequest('run-one', '/1/confirm', { method: 'POST', body: JSON.stringify(decision) }),
      /changed.*Review/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
