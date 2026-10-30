import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSnapshot,
  parseRunReference,
  panelistDeliveryLabel,
  parseCatalog,
} from '../src/lib/agents.ts';
import { SpeechInterruptions, SpeechTracker } from '../src/lib/speech-queue.ts';

const base = { messages: [], status: 'idle', pose: 'front', poseRevision: 0 };
const message = { id: 'source', text: 'B, the launch code is amber.', status: 'completed' };

test('preserves addressed source and incoming reply attribution without copying their text', () => {
  const delivery = { id: 'delivery', recipient: 'b', status: 'queued' };
  const addressed = { ...message, addressedTo: 'b', delivery };
  const source = parseSnapshot({ ...base, messages: [addressed] });
  assert.deepEqual(source.messages, [addressed]);
  assert.equal(source.pendingPanelistMessages, 0);
  const response = {
    id: 'response',
    text: 'Amber received.',
    status: 'streaming',
    fromPanelist: 'a',
  };
  const incoming = parseSnapshot({
    ...base,
    status: 'working',
    activeSource: 'panelist',
    pendingPanelistMessages: 2,
    messages: [response],
  });
  assert.deepEqual(incoming.messages, [response]);
  assert.equal(incoming.activeSource, 'panelist');
  assert.equal(incoming.pendingPanelistMessages, 2);
  assert.equal(panelistDeliveryLabel({ ...delivery, status: 'dispatched' }), 'Sending to B');
  assert.equal(panelistDeliveryLabel({ ...delivery, status: 'completed' }), 'B replied');
});

test('rejects invalid routing and queue metadata at the snapshot boundary', () => {
  for (const invalid of [
    { ...base, activeSource: 'system' },
    { ...base, pendingPanelistMessages: -1 },
    { ...base, pendingPanelistMessages: 0.5 },
    { ...base, messages: [{ ...message, addressedTo: 'sid' }] },
    { ...base, messages: [{ ...message, fromPanelist: 'system' }] },
    {
      ...base,
      messages: [{ ...message, delivery: { id: 'd', recipient: 'b', status: 'understood' } }],
    },
    {
      ...base,
      messages: [
        { ...message, delivery: { id: 'd', recipient: 'b', status: 'failed', detail: 5 } },
      ],
    },
  ])
    assert.throws(() => parseSnapshot(invalid), /unreadable update/);
});

test('human takeover stops old speech without suppressing the new human-prompted reply', () => {
  const interruptions = new SpeechInterruptions();
  const tracker = new SpeechTracker();
  const peer = { id: 'peer-reply', text: 'Old phrase. ', status: 'streaming' };
  assert.equal(interruptions.observe('a', [peer]).interrupted, false);
  assert.equal(tracker.collect('a', [peer]).length, 0);
  tracker.baseline('a', [peer]);
  interruptions.clear();
  const next = [
    { ...peer, status: 'stopped' },
    {
      id: 'human-reply',
      text: 'Your message has priority.',
      narration: {
        status: 'ready',
        revision: 'revision',
        segments: ['Your message has priority.'],
      },
      status: 'completed',
    },
  ];
  assert.equal(interruptions.observe('a', next).interrupted, false);
  assert.deepEqual(
    tracker.collect('a', next).map((phrase) => phrase.text),
    ['Your message has priority.'],
  );
  const unplanned = { id: 'unplanned', text: 'A later phrase.', status: 'streaming' };
  interruptions.observe('b', [unplanned]);
  assert.equal(interruptions.observe('b', [{ ...unplanned, status: 'failed' }]).interrupted, true);
});

test('a remote takeover preserves a new reply when the stopped peer and new response arrive together', () => {
  const interruptions = new SpeechInterruptions();
  const tracker = new SpeechTracker();
  const peer = { id: 'old-peer', text: 'Old phrase. ', status: 'streaming' };
  interruptions.observe('a', [peer]);
  tracker.collect('a', [peer]);
  const coalesced = [
    { ...peer, status: 'stopped' },
    {
      id: 'new-human',
      text: 'A new complete reply.',
      narration: { status: 'ready', revision: 'revision', segments: ['A new complete reply.'] },
      status: 'completed',
    },
  ];
  const observation = interruptions.observe('a', coalesced);
  assert.equal(observation.interrupted, true);
  tracker.baseline(
    'a',
    coalesced.filter((reply) => observation.previousReplyIds.has(reply.id)),
  );
  assert.deepEqual(
    tracker.collect('a', coalesced).map((phrase) => phrase.text),
    ['A new complete reply.'],
  );
});

const catalogSeat = (id, provider, model) => ({
  id,
  name: id.toUpperCase(),
  provider,
  model,
  effort: 'high',
  runtime: provider,
  status: 'ready',
});

test('catalog keeps A/B roles when providers swap or both use the same model', () => {
  const swapped = [
    catalogSeat('a', 'anthropic', 'claude-opus-5-5'),
    catalogSeat('b', 'codex', 'gpt-6-luna'),
  ];
  assert.deepEqual(parseCatalog({ agents: swapped }), swapped);
  const sharedModel = [
    catalogSeat('a', 'codex', 'gpt-6-luna'),
    catalogSeat('b', 'codex', 'gpt-6-luna'),
  ];
  assert.deepEqual(parseCatalog({ agents: sharedModel }), sharedModel);
  assert.throws(
    () =>
      parseCatalog({ agents: [...sharedModel, catalogSeat('maestro', 'codex', 'gpt-6.1-sol')] }),
    /invalid agent/,
  );
  assert.throws(
    () => parseCatalog({ agents: [catalogSeat('a', 'other', 'unknown'), swapped[1]] }),
    /invalid agent/,
  );
});

test('pins snapshots to a run and preserves legacy author and model provenance', () => {
  const migrated = {
    ...base,
    runId: 'run-1',
    revision: 3,
    cursor: 12,
    messages: [
      {
        ...message,
        originalAuthor: 'Opus',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        effort: 'high',
        bindingId: 'legacy-binding',
        partialRevision: 2,
      },
    ],
  };
  assert.deepEqual(parseRunReference({ id: 'run-1', revision: 3 }), { id: 'run-1', revision: 3 });
  const parsed = parseSnapshot(migrated, undefined, undefined, 'run-1');
  assert.equal(parsed.messages[0].originalAuthor, 'Opus');
  assert.equal(parsed.messages[0].bindingId, 'legacy-binding');
  assert.equal(parsed.revision, 3);
  assert.throws(() => parseSnapshot(migrated, undefined, undefined, 'run-2'), /unreadable update/);
  assert.throws(
    () => parseRunReference({ id: 'run-1', revision: 0 }),
    /current run could not be read/,
  );
  for (const invalid of [
    { ...migrated, revision: 1.2 },
    { ...migrated, cursor: -1 },
    { ...migrated, messages: [{ ...migrated.messages[0], originalAuthor: 4 }] },
    { ...migrated, messages: [{ ...migrated.messages[0], provider: 'third-party' }] },
  ])
    assert.throws(() => parseSnapshot(invalid), /unreadable update/);
});

test('accepts a full permitted narration even when it spans more than 64 segments', () => {
  const narration = {
    status: 'ready',
    revision: 'a'.repeat(64),
    segments: Array(79).fill('x'.repeat(200)),
  };
  const snapshot = parseSnapshot({ ...base, messages: [{ ...message, narration }] });
  assert.deepEqual(snapshot.messages[0].narration, narration);
  const tracker = new SpeechTracker();
  assert.equal(tracker.collect('a', snapshot.messages).length, 79);
});
