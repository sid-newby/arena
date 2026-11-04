import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechTracker, SpeechQueue } from '../src/lib/speech-queue.ts';

const reply = (id, text, status = 'streaming') => ({
  id,
  text,
  status,
  narration: { status: 'ready', revision: 'saved-summary', segments: [text] },
});
const until = async (check) => {
  for (let i = 0; i < 40; i++) {
    if (check()) return;
    await new Promise(setImmediate);
  }
  throw new Error('Condition did not settle.');
};

test('history and active replies are baselined; completed replies are emitted once', () => {
  const tracker = new SpeechTracker();
  tracker.baseline('a', [
    reply('old', 'Earlier sentence.', 'completed'),
    reply('active', 'Already started'),
  ]);
  assert.deepEqual(
    tracker.collect('a', [reply('active', 'Already started then completed.', 'completed')]),
    [],
  );
  assert.deepEqual(tracker.collect('a', [reply('new', 'A fresh')]), []);
  assert.deepEqual(
    tracker.collect('a', [reply('new', 'A fresh reply. Another')]).map((s) => s.text),
    [],
  );
  assert.deepEqual(tracker.collect('a', [reply('new', 'A fresh reply. Another')]), []);
  assert.deepEqual(
    tracker.collect('a', [reply('new', 'A fresh reply. Another', 'completed')]).map((s) => s.text),
    ['A fresh reply. Another'],
  );
  assert.deepEqual(tracker.collect('a', [reply('new', 'A fresh reply. Another', 'completed')]), []);
});

test('enabling speech skips completed history and speaks an active reply on completion', () => {
  const tracker = new SpeechTracker();
  tracker.baseline(
    'a',
    [reply('history', 'Earlier reply.', 'completed'), reply('active', 'Still working')],
    'completed',
  );
  const completed = [
    reply('history', 'Earlier reply.', 'completed'),
    reply('active', 'Still working, now finished.', 'completed'),
  ];
  assert.deepEqual(
    tracker.collect('a', completed).map((segment) => segment.replyId),
    ['active'],
  );
  assert.deepEqual(tracker.collect('a', completed), []);
});

test('history baselining never re-enables an explicitly stopped active reply', () => {
  const tracker = new SpeechTracker();
  const active = reply('active', 'Still working');
  tracker.baseline('b', [active]);
  tracker.baseline('b', [active], 'completed');
  assert.deepEqual(tracker.collect('b', [reply('active', 'Now complete.', 'completed')]), []);
});

test('uses concise speech summary instead of code displayed on the panel', () => {
  const tracker = new SpeechTracker();
  const displayed = 'Explanation.\n```typescript\nconst secret = process.env.API_KEY;\n```';
  const full = {
    ...reply('summarized', displayed, 'completed'),
    narration: { status: 'ready', revision: 'ready-revision', segments: ['The panel is ready.'] },
  };
  assert.deepEqual(
    tracker.collect('a', [{ ...full, text: displayed.slice(0, 15), status: 'streaming' }]),
    [],
  );
  assert.deepEqual(
    tracker.collect('a', [full]).map((segment) => segment.text),
    ['The panel is ready.'],
  );
});

test('reports the server rejection instead of retrying panel prose', () => {
  const tracker = new SpeechTracker();
  const full = {
    ...reply('code', 'const x = 1;', 'completed'),
    narration: {
      status: 'unavailable',
      reason: 'The spoken summary contains possible source code.',
    },
  };
  assert.deepEqual(tracker.collect('a', [full]), []);
  assert.match(tracker.takeNotice(), /possible source code/);
});

test('a quiet hangout turn produces no speech or missing-summary warning', () => {
  const tracker = new SpeechTracker();
  assert.deepEqual(
    tracker.collect('a', [
      { ...reply('quiet', 'Reading along.', 'completed'), narration: { status: 'quiet' } },
    ]),
    [],
  );
  assert.equal(tracker.takeNotice(), undefined);
});

test('does not speak a response without a separate summary', () => {
  const tracker = new SpeechTracker();
  assert.deepEqual(
    tracker.collect('a', [{ id: 'missing', text: 'const x = 1;', status: 'completed' }]),
    [],
  );
  assert.match(tracker.takeNotice(), /No spoken summary was provided/);
});

test('a summary with many short sentences fits in the speech queue without losing content', () => {
  const tracker = new SpeechTracker();
  const summary = Array.from({ length: 50 }, (_, i) => `Point ${i + 1}.`).join(' ');
  const segments = tracker.collect('a', [
    {
      ...reply('many', summary, 'completed'),
      narration: {
        status: 'ready',
        revision: 'many',
        segments: [summary.slice(0, 300), summary.slice(301)],
      },
    },
  ]);
  assert.ok(segments.length < 32);
  assert.equal(segments.map((segment) => segment.text).join(' '), summary);
});

test('stop baselines both agents and stopped/failed replies never yield later tails', () => {
  const tracker = new SpeechTracker();
  tracker.collect('a', [reply('x', 'First sentence. ')]);
  tracker.baseline('a', [reply('x', 'First sentence. ')]);
  assert.deepEqual(
    tracker.collect('a', [reply('x', 'First sentence. Late sentence.', 'completed')]),
    [],
  );
  assert.deepEqual(tracker.collect('b', [reply('y', 'No speech.', 'stopped')]), []);
  assert.deepEqual(tracker.collect('b', [reply('z', 'No speech.', 'failed')]), []);
  const long = tracker.collect('b', [
    {
      ...reply('long', 'a'.repeat(900), 'completed'),
      narration: {
        status: 'ready',
        revision: 'long',
        segments: ['a'.repeat(350), 'a'.repeat(350), 'a'.repeat(200)],
      },
    },
  ]);
  assert.ok(long.every((s) => s.text.length <= 350));
});

class Source extends EventTarget {
  connect() {}
  disconnect() {}
  stop() {
    this.dispatchEvent(new Event('ended'));
  }
  start() {
    started.push(this);
  }
}
let started = [];
class Context {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  createBuffer(_, length, rate) {
    return { duration: length / rate, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return new Source();
  }
}
const audio = Buffer.from(new Float32Array([0.1, -0.1]).buffer).toString('base64');
const packet =
  JSON.stringify({ type: 'audio', audio, sampleRate: 44100 }) +
  '\n' +
  JSON.stringify({ type: 'done' }) +
  '\n';
const segment = (agent) => ({
  agent,
  text: 'Benign offline fixture.',
  requestId: crypto.randomUUID(),
  test: true,
});

test('both seats speak at once on their own lanes; one seat still plays in order', async () => {
  const previousContext = globalThis.AudioContext,
    previousFetch = globalThis.fetch;
  const requests = [],
    statuses = [];
  started = [];
  globalThis.AudioContext = Context;
  globalThis.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body).agent);
    return new Response(packet);
  };
  const queue = new SpeechQueue((state) => statuses.push(state), assert.fail);
  try {
    await queue.resume();
    queue.enqueue([segment('a'), segment('a'), segment('b')]);
    // A and B both start without waiting for the other to finish.
    await until(() => started.length === 2);
    assert.deepEqual(requests.toSorted(), ['a', 'b']);
    assert.ok(statuses.includes('Speaking A and B'));
    // A's second phrase waits for A's first to end, not for B.
    assert.equal(requests.filter((agent) => agent === 'a').length, 1);
    const [first, second] = started;
    first.stop();
    second.stop();
    await until(() => started.length === 3);
    assert.deepEqual(requests.toSorted(), ['a', 'a', 'b']);
    started[2].stop();
    await until(() => statuses.some((s) => s.startsWith('Voice test complete')));
    assert.equal(queue.isBusy, false);
  } finally {
    queue.close();
    globalThis.AudioContext = previousContext;
    globalThis.fetch = previousFetch;
  }
});

test('stop aborts network, drops backlog, and rejects late audio from old generation', async () => {
  const previousContext = globalThis.AudioContext,
    previousFetch = globalThis.fetch;
  const releases = [],
    signals = [];
  const requests = [];
  started = [];
  globalThis.AudioContext = Context;
  globalThis.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body).agent);
    signals.push(options.signal);
    return new Promise((resolve) => {
      releases.push(() => resolve(new Response(packet)));
    });
  };
  const queue = new SpeechQueue(() => {}, assert.fail);
  try {
    queue.enqueue([segment('a'), segment('a'), segment('b')]);
    // Both lanes have one request in flight; A's second phrase is backlog.
    await until(() => releases.length === 2);
    queue.stop();
    assert.ok(signals.every((signal) => signal.aborted));
    for (const release of releases) release();
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.deepEqual(requests.toSorted(), ['a', 'b']);
    assert.equal(started.length, 0);
    assert.equal(queue.isBusy, false);
  } finally {
    queue.close();
    globalThis.AudioContext = previousContext;
    globalThis.fetch = previousFetch;
  }
});

test('45-second deadline aborts a starved fetch and reports a bounded failure', async (t) => {
  const previousContext = globalThis.AudioContext,
    previousFetch = globalThis.fetch;
  let signal;
  const errors = [];
  started = [];
  globalThis.AudioContext = Context;
  globalThis.fetch = (_request, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    );
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const queue = new SpeechQueue(
    () => {},
    (message) => errors.push(message),
  );
  try {
    queue.enqueue([segment('a'), segment('b')]);
    t.mock.timers.tick(45_000);
    await new Promise(setImmediate);
    assert.equal(signal.aborted, true);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /timed out after 45 seconds/);
    assert.equal(queue.isBusy, false);
    assert.equal(started.length, 0);
  } finally {
    queue.close();
    t.mock.timers.reset();
    globalThis.AudioContext = previousContext;
    globalThis.fetch = previousFetch;
  }
});

test('playback submits saved references without panel or narration text', async () => {
  const previousContext = globalThis.AudioContext,
    previousFetch = globalThis.fetch;
  let body;
  started = [];
  globalThis.AudioContext = Context;
  globalThis.fetch = async (_, options) => {
    body = JSON.parse(options.body);
    return new Response(packet);
  };
  const queue = new SpeechQueue(() => {}, assert.fail);
  try {
    queue.enqueue([
      {
        agent: 'a',
        text: 'Caller content must not be sent.',
        requestId: 'reference-request',
        replyId: 'reply',
        runId: 'run',
        revision: 'saved-revision',
        segment: 0,
      },
    ]);
    await until(() => started.length === 1);
    assert.deepEqual(body, {
      kind: 'reply',
      agent: 'a',
      requestId: 'reference-request',
      replyId: 'reply',
      runId: 'run',
      revision: 'saved-revision',
      segment: 0,
    });
    started[0].stop();
  } finally {
    queue.close();
    globalThis.AudioContext = previousContext;
    globalThis.fetch = previousFetch;
  }
});

test('silencing a speaker stops their active audio and queued phrases while the other speaker continues', async () => {
  const previousContext = globalThis.AudioContext,
    previousFetch = globalThis.fetch;
  const requests = [];
  started = [];
  globalThis.AudioContext = Context;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body).agent);
    return new Response(packet);
  };
  const queue = new SpeechQueue(() => {}, assert.fail);
  try {
    queue.enqueue([segment('a'), segment('a'), segment('b')]);
    // A's first phrase and B's phrase start together on separate lanes.
    await until(() => started.length === 2);
    queue.silence('a');
    // A's second phrase is dropped; B keeps playing until it ends on its own.
    for (const source of started) source.stop();
    await until(() => !queue.isBusy);
    assert.deepEqual(requests.toSorted(), ['a', 'b']);
  } finally {
    queue.close();
    globalThis.AudioContext = previousContext;
    globalThis.fetch = previousFetch;
  }
});
