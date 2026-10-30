import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeRoomEvents } from '../src/lib/room-events.ts';

test('shares one connection, releases hidden tabs, and restores all channels when shown', async () => {
  const originalSource = globalThis.EventSource;
  const originalDocument = globalThis.document;
  const sources = [];
  class Source extends EventTarget {
    closed = false;
    constructor(url) {
      super();
      this.url = url;
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
    send(channel, data) {
      this.dispatchEvent(new MessageEvent(channel, { data }));
    }
  }
  const document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.EventSource = Source;
  globalThis.document = document;
  const received = [];
  const listener = (channel) => ({
    message: ({ data }) => received.push([channel, data]),
    error() {},
  });
  const stops = [];
  try {
    stops.push(subscribeRoomEvents('one', 'a', listener('a')));
    stops.push(subscribeRoomEvents('one', 'b', listener('b')));
    stops.push(subscribeRoomEvents('one', 'maestro', listener('maestro')));
    assert.equal(sources.length, 1);
    sources[0].send('a', 'A snapshot');
    sources[0].send('b', 'B snapshot');
    sources[0].send('maestro', 'Maestro snapshot');
    assert.deepEqual(received, [
      ['a', 'A snapshot'],
      ['b', 'B snapshot'],
      ['maestro', 'Maestro snapshot'],
    ]);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(sources[0].closed, true);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(sources.length, 2);
    sources[1].send('a', 'Fresh snapshot');
    assert.deepEqual(received.at(-1), ['a', 'Fresh snapshot']);
    stops.shift()();
    assert.equal(sources[1].closed, false);
    stops.splice(0).forEach((stop) => stop());
    assert.equal(sources[1].closed, true);
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(sources.length, 2);
  } finally {
    stops.forEach((stop) => stop());
    globalThis.EventSource = originalSource;
    globalThis.document = originalDocument;
  }
});
