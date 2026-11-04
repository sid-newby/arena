import assert from 'node:assert/strict';
import test from 'node:test';
import { resumeAudio } from '../src/lib/resume-audio.ts';

const nextTask = () => new Promise(setImmediate);

test('starts an eligible context without waiting for room interaction', async () => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    let attempts = 0;
    const context = {
      state: 'suspended',
      async resume() {
        attempts++;
      },
    };
    await resumeAudio(context, new AbortController().signal);
    globalThis.window.dispatchEvent(new Event('click'));
    assert.equal(attempts, 1);
  } finally {
    globalThis.window = previous;
  }
});

test('a browser gesture can unlock audio, but cannot restart a cancelled attempt', async () => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    let permitted = false;
    let attempts = 0;
    const context = {
      state: 'suspended',
      async resume() {
        attempts++;
        if (!permitted) throw new DOMException('Interaction required', 'NotAllowedError');
      },
    };
    const muted = new AbortController();
    const first = resumeAudio(context, muted.signal);
    await nextTask();
    muted.abort();
    await assert.rejects(first, { name: 'AbortError' });
    globalThis.window.dispatchEvent(new Event('click'));
    assert.equal(attempts, 1);

    const retry = resumeAudio(context, new AbortController().signal);
    await nextTask();
    permitted = true;
    globalThis.window.dispatchEvent(new Event('keydown'));
    await retry;
    assert.equal(attempts, 3);
  } finally {
    globalThis.window = previous;
  }
});
