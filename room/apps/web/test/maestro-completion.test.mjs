import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForMaestroTurn } from '../src/lib/maestro.ts';
import { subscribeRoomEvents } from '../src/lib/room-events.ts';

function fixture() {
  const originalSource = globalThis.EventSource;
  const originalDocument = globalThis.document;
  const sources = [];
  class Source extends EventTarget {
    closed = false;
    constructor() {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
    send(messages) {
      this.dispatchEvent(
        new MessageEvent('maestro', {
          data: JSON.stringify({
            runId: 'completion-run',
            model: 'test-model',
            effort: 'high',
            status: 'idle',
            available: true,
            latestSeq: 1,
            messages,
          }),
        }),
      );
    }
  }
  globalThis.EventSource = Source;
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  return {
    sources,
    restore() {
      globalThis.EventSource = originalSource;
      globalThis.document = originalDocument;
    },
  };
}
const message = (turnId, status = 'completed', role = 'assistant') => ({
  id: `${turnId}-${role}`,
  turnId,
  status,
  role,
  text: 'Synthetic criteria.',
});

test('criteria completion waits for its assistant turn and releases its shared stream listener', async () => {
  const { sources, restore } = fixture();
  const controller = new AbortController();
  try {
    let resolved = false;
    const result = waitForMaestroTurn('completion-run', 'target-turn', controller.signal).then(
      (value) => {
        resolved = true;
        return value;
      },
    );
    sources[0].send([
      message('other-turn'),
      message('target-turn', 'completed', 'user'),
      message('target-turn', 'streaming'),
    ]);
    await new Promise(setImmediate);
    assert.equal(resolved, false);
    sources[0].send([message('target-turn', 'failed')]);
    assert.equal((await result).status, 'failed');
    assert.equal(sources[0].closed, true);
  } finally {
    controller.abort();
    restore();
  }
});

test('completion already cached before subscription resolves without polling or another connection', async () => {
  const { sources, restore } = fixture();
  const controller = new AbortController();
  const unsubscribe = subscribeRoomEvents('completion-run', 'maestro', {
    message() {},
    error() {},
  });
  try {
    sources[0].send([message('cached-turn')]);
    const result = await waitForMaestroTurn('completion-run', 'cached-turn', controller.signal);
    assert.equal(result.turnId, 'cached-turn');
    assert.equal(sources.length, 1);
    assert.equal(sources[0].closed, false);
    unsubscribe();
    assert.equal(sources[0].closed, true);
  } finally {
    controller.abort();
    unsubscribe();
    restore();
  }
});

test('scope abort and bounded timeout remove completion subscriptions', async () => {
  const { sources, restore } = fixture();
  const controller = new AbortController();
  try {
    const waiting = waitForMaestroTurn('completion-run', 'aborted-turn', controller.signal);
    controller.abort();
    await assert.rejects(waiting, { name: 'AbortError' });
    assert.equal(sources[0].closed, true);
    await assert.rejects(
      waitForMaestroTurn('completion-run', 'late-turn', new AbortController().signal, 5),
      /still working/,
    );
    assert.equal(sources[1].closed, true);
  } finally {
    controller.abort();
    restore();
  }
});

test('temporary stream errors allow the reconnect snapshot to complete the pending turn', async () => {
  const { sources, restore } = fixture();
  const controller = new AbortController();
  try {
    const waiting = waitForMaestroTurn('completion-run', 'reconnected-turn', controller.signal);
    sources[0].dispatchEvent(new Event('error'));
    sources[0].send([message('reconnected-turn')]);
    assert.equal((await waiting).turnId, 'reconnected-turn');
    assert.equal(sources[0].closed, true);
  } finally {
    controller.abort();
    restore();
  }
});
