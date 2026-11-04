import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMessageReceipt,
  parseHumanMessages,
  parseSideSnapshot,
  parseWorkflowInvalidation,
  messagePending,
} from '../src/lib/messaging.ts';
import { prepareDelivery } from '../src/lib/run-scope.ts';
import { emptySnapshot, parseSnapshot } from '../src/lib/agents.ts';

const receipt = {
  id: 'message-a',
  requestId: 'request-a',
  runId: 'run-one',
  seat: 'a',
  bindingId: 'binding-a',
  revision: 2,
  intent: 'queue',
  text: 'A follow-up.',
  status: 'queued',
  createdAt: 20,
};
test('a queued receipt is accepted without a turn id and stays separate from spoken replies', () => {
  assert.deepEqual(parseMessageReceipt(receipt, 'run-one', 'a'), receipt);
  const snapshot = parseSnapshot(
    { ...emptySnapshot, runId: 'run-one', humanMessages: [receipt] },
    undefined,
    undefined,
    'run-one',
  );
  assert.equal(snapshot.humanMessages[0].status, 'queued');
  assert.deepEqual(snapshot.messages, []);
  assert.equal(messagePending(snapshot.humanMessages[0]), true);
  assert.deepEqual(parseHumanMessages(undefined), []);
});
test('a past unconfirmed delivery is history and never keeps the composer pending', () => {
  const interrupted = parseMessageReceipt({ ...receipt, status: 'uncertain' });
  assert.equal(messagePending(interrupted), false);
});
test('receipts cannot cross run or seat scope and malformed delivery data is rejected', () => {
  assert.throws(() => parseMessageReceipt(receipt, 'run-two', 'a'), /unreadable/);
  assert.throws(() => parseMessageReceipt(receipt, 'run-one', 'b'), /unreadable/);
  for (const change of [
    { status: 'accepted' },
    { revision: 0 },
    { intent: 'surprise' },
    { bindingId: '' },
    { createdAt: -1 },
  ])
    assert.throws(() => parseMessageReceipt({ ...receipt, ...change }), /unreadable/);
});
test('Both retries retain their intent and changing delivery mode creates a new request', () => {
  const scope = { runId: 'run-one', revision: 2 };
  const first = prepareDelivery(undefined, scope, 'Question', ['a', 'b'], 'request-one', 'queue');
  first.delivered.add('a');
  const retry = prepareDelivery(
    first,
    { ...scope, revision: 3 },
    'Question',
    ['a', 'b'],
    'unused',
    'queue',
  );
  assert.equal(retry.requestId, 'request-one');
  assert.equal(retry.revision, 2);
  assert.equal(retry.intent, 'queue');
  assert.deepEqual([...retry.delivered], ['a']);
  const interrupt = prepareDelivery(
    first,
    scope,
    'Question',
    ['a', 'b'],
    'request-two',
    'interrupt',
  );
  assert.equal(interrupt.requestId, 'request-two');
  assert.deepEqual([...interrupt.delivered], []);
  assert.equal(interrupt.intent, 'interrupt');
});
test('side conversations validate lane identity and preserve queued and partial side replies', () => {
  const value = {
    runId: 'run-one',
    seat: 'a',
    bindingId: 'binding-a',
    revision: 2,
    status: 'working',
    messages: [
      {
        id: 'side-one',
        requestId: 'request-one',
        prompt: 'A private question.',
        text: 'Partial.',
        status: 'streaming',
      },
      {
        id: 'side-two',
        requestId: 'request-two',
        prompt: 'A later private question.',
        text: '',
        status: 'queued',
      },
    ],
  };
  assert.deepEqual(parseSideSnapshot(value, 'run-one', 'a'), value);
  assert.throws(() => parseSideSnapshot(value, 'run-one', 'b'), /unreadable/);
  assert.throws(
    () =>
      parseSideSnapshot(
        { ...value, messages: [{ ...value.messages[0], status: 'running' }] },
        'run-one',
        'a',
      ),
    /unreadable/,
  );
});
test('workflow invalidations carry an authoritative run revision and replay cursor', () => {
  const value = { runId: 'run-one', revision: 3, cursor: 12 };
  assert.deepEqual(parseWorkflowInvalidation(value, 'run-one'), value);
  assert.throws(() => parseWorkflowInvalidation(value, 'run-two'), /Unreadable/);
  assert.throws(() => parseWorkflowInvalidation({ ...value, cursor: -1 }, 'run-one'), /Unreadable/);
});
