import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PcmChunker,
  listenSocketUrl,
  parseListenEvent,
  resample,
  toPcm16,
  transcriptReady,
  wordCount,
} from '../src/lib/microphone.ts';

test('resample keeps duration while changing the sample rate', () => {
  const input = new Float32Array(480).map((_, i) => Math.sin(i / 10));
  const output = resample(input, 48000, 16000);
  assert.equal(output.length, 160);
  assert.ok(Math.abs(output[0] - input[0]) < 1e-6);
  assert.ok(Math.abs(output[159] - input[477]) < 0.01);
  assert.equal(resample(input, 16000, 16000), input);
});

test('toPcm16 clamps and scales samples', () => {
  const pcm = toPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
  assert.deepEqual([...pcm], [0, 32767, -32768, 32767, -32768, 16383]);
});

test('PcmChunker emits fixed 100ms frames and keeps the remainder', () => {
  const chunker = new PcmChunker(16000, 100);
  assert.equal(chunker.push(new Int16Array(1000)).length, 0);
  const chunks = chunker.push(new Int16Array(2800).fill(7));
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 1600);
  assert.equal(chunks[0][0], 0);
  assert.equal(chunks[0][1000], 7);
  assert.equal(chunker.push(new Int16Array(1400)).length, 1);
});

test('parseListenEvent accepts only the room listening protocol', () => {
  assert.deepEqual(parseListenEvent('{"type":"ready"}'), { type: 'ready' });
  assert.deepEqual(parseListenEvent({ type: 'turn.end', transcript: 'Hi ' }), {
    type: 'turn.end',
    transcript: 'Hi ',
  });
  assert.equal(parseListenEvent({ type: 'turn.end' }), undefined);
  assert.equal(parseListenEvent('{"type":"audio"}'), undefined);
  assert.equal(parseListenEvent('not json'), undefined);
  assert.deepEqual(parseListenEvent({ type: 'error' }), {
    type: 'error',
    message: 'Listening failed.',
  });
});

test('transcripts need a letter or digit before they are sent', () => {
  assert.equal(transcriptReady('  Hey Fable, hello.  '), 'Hey Fable, hello.');
  assert.equal(transcriptReady(' ... '), undefined);
  assert.equal(wordCount('  one two  '), 2);
});

test('the listening socket follows the page origin', () => {
  assert.equal(
    listenSocketUrl({ protocol: 'http:', host: '127.0.0.1:58241' }),
    'ws://127.0.0.1:58241/api/speech/listen',
  );
  assert.equal(listenSocketUrl({ protocol: 'https:', host: 'x' }), 'wss://x/api/speech/listen');
});
