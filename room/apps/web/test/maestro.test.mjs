import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrentRun, parseMaestroSnapshot, parseMaestroTurn } from '../src/lib/maestro.ts';

const snapshot = {
  runId: 'run-1',
  model: 'gpt-6.1-sol',
  effort: 'high',
  status: 'working',
  available: true,
  latestSeq: 25,
  analysisThroughSeq: 20,
  messages: [
    { id: 'prompt-1', role: 'user', text: 'Where do A and B disagree?', status: 'completed' },
    {
      id: 'reply-1',
      role: 'assistant',
      text: 'They differ on',
      status: 'streaming',
      throughSeq: 20,
    },
  ],
};

test('preserves private authors, partial text, and the analysis boundary as debate advances', () => {
  const parsed = parseMaestroSnapshot(snapshot, 'run-1');
  assert.deepEqual(parsed.messages, snapshot.messages);
  assert.equal(parsed.analysisThroughSeq, 20);
  assert.equal(parsed.latestSeq, 25);
  assert.notEqual(parsed.messages[0], snapshot.messages[0]);
});

test('rejects another run and malformed correspondence metadata before it can replace this chat', () => {
  for (const change of [
    { runId: 'run-2' },
    { latestSeq: -1 },
    { latestSeq: 1.5 },
    { analysisThroughSeq: '20' },
    { available: 'yes' },
    { reason: 42 },
    { status: 'stopping' },
    { messages: [{ ...snapshot.messages[0], role: 'a' }] },
    { messages: [{ ...snapshot.messages[0], status: 'streaming' }] },
    { messages: [{ ...snapshot.messages[1], throughSeq: -2 }] },
    { messages: [snapshot.messages[0], snapshot.messages[0]] },
  ]) {
    assert.throws(
      () => parseMaestroSnapshot({ ...snapshot, ...change }, 'run-1'),
      /unreadable update/,
    );
  }
});

test('retains unavailable and stopped histories without pretending a provider is ready', () => {
  const parsed = parseMaestroSnapshot(
    {
      ...snapshot,
      status: 'failed',
      available: false,
      reason: 'The selected model is unavailable.',
      error: 'Sign in to the configured account.',
      messages: [snapshot.messages[0], { ...snapshot.messages[1], status: 'stopped' }],
    },
    'run-1',
  );
  assert.equal(parsed.available, false);
  assert.equal(parsed.reason, 'The selected model is unavailable.');
  assert.equal(parsed.messages[1].status, 'stopped');
});

test('requires an explicit run identity and an accepted-turn receipt', () => {
  assert.equal(parseCurrentRun({ id: 'run-1' }), 'run-1');
  assert.equal(parseMaestroTurn({ turnId: 'turn-1' }), 'turn-1');
  for (const value of [null, {}, { id: '' }, { id: 1 }])
    assert.throws(() => parseCurrentRun(value), /current run could not be read/);
  for (const value of [null, {}, { turnId: '' }, { turnId: 1 }])
    assert.throws(() => parseMaestroTurn(value), /did not confirm/);
});

test('pending cancellation targets its request instead of an earlier visible response', async () => {
  const { maestroCancellationTarget } = await import('../src/lib/maestro.ts');
  const activeSnapshot = {
    messages: [{ id: 'old-assistant', turnId: 'old-turn', role: 'assistant', status: 'streaming' }],
  };
  assert.deepEqual(maestroCancellationTarget(activeSnapshot, 'pending-request'), {
    requestId: 'pending-request',
  });
  assert.deepEqual(maestroCancellationTarget(activeSnapshot), { turnId: 'old-turn' });
  assert.equal(
    maestroCancellationTarget({
      messages: [{ id: 'finished', turnId: 'done', role: 'assistant', status: 'completed' }],
    }),
    undefined,
  );
});

test('preserves feedback read and question state and rejects malformed feedback', () => {
  const feedback = { eventId: 'blocked-1', read: false, question: 'unresolved' };
  const entry = { ...snapshot.messages[1], turnId: 'turn-1', status: 'completed', feedback };
  assert.deepEqual(
    parseMaestroSnapshot({ ...snapshot, messages: [entry] }, 'run-1').messages[0].feedback,
    feedback,
  );
  for (const invalid of [
    { ...feedback, read: 'no' },
    { ...feedback, question: 'open' },
    { ...feedback, eventId: '' },
  ]) {
    assert.throws(
      () =>
        parseMaestroSnapshot({ ...snapshot, messages: [{ ...entry, feedback: invalid }] }, 'run-1'),
      /unreadable update/,
    );
  }
});
