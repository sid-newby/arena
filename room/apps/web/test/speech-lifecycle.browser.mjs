import React from 'react';
import { createRoot } from 'react-dom/client';
import { useSpeech } from '../src/hooks/use-speech.ts';

const reply = (id, status = 'streaming') => ({
  id,
  status,
  text: 'Fixture reply.',
  narration: { status: 'ready', revision: 'fixture', segments: ['Fixture summary.'] },
});
const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

export function mountSpeechChecks() {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const root = createRoot(host);
  const requests = [];
  const results = [];
  const originalFetch = window.fetch;
  let runId = 'speech-fixture-one';
  let speech;
  let preview = false;
  const seat = (messages = [], connection = 'connected', id = runId) => ({
    connection,
    snapshot: { runId: id, messages },
  });
  let agents = { a: seat([reply('history', 'completed'), reply('active')]), b: seat() };
  async function until(predicate) {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await wait();
    }
    throw new Error(`Speech check timed out. ${speech?.status} ${speech?.error ?? ''}`);
  }
  function check(condition, message) {
    results.push({ message, passed: Boolean(condition) });
    if (!condition) throw new Error(message);
  }
  window.fetch = async (url, options) => {
    if (url === '/api/speech/status')
      return Response.json({ ready: true, detail: 'Deterministic speech fixture.' });
    if (url === '/api/speech/stream') {
      const body = JSON.parse(options.body);
      if (body.kind !== 'test' && !body.runId?.startsWith('speech-fixture-'))
        throw new Error('Speech fixture attempted to synthesize a real reply.');
      requests.push(body);
      const audio = btoa(String.fromCharCode(...new Uint8Array(new Float32Array(4410).buffer)));
      return new Response(
        `${JSON.stringify({ type: 'audio', audio, sampleRate: 44100 })}\n{"type":"done"}\n`,
      );
    }
    return originalFetch(url, options);
  };
  function Harness() {
    const current = useSpeech(agents, preview, runId);
    React.useEffect(() => {
      speech = current;
    }, [current]);
    return React.createElement(
      'main',
      null,
      React.createElement('h1', null, 'Speech lifecycle checks'),
      React.createElement(
        'button',
        { onClick: run, disabled: !current.ready || results.length > 0 },
        'Run speech checks',
      ),
      React.createElement('pre', null, JSON.stringify(results, null, 2)),
    );
  }
  const render = async () => {
    root.render(React.createElement(Harness));
    await wait();
  };
  async function complete(agent, id) {
    agents = { ...agents, [agent]: seat([reply(id, 'completed')]) };
    await render();
    await until(() => !speech.busy);
  }
  async function run() {
    try {
      await speech.enable();
      await wait();
      await complete('a', 'active');
      check(
        requests.length === 1 && requests[0].replyId === 'active',
        'Enable during a reply speaks it once and skips history.',
      );

      runId = 'speech-fixture-two';
      await render();
      check(
        speech.enabled && requests.length === 1,
        'Run change preserves opt-in and ignores old-run snapshots.',
      );
      agents = { ...agents, a: seat([reply('new-history', 'completed')]) };
      await render();
      agents = { ...agents, b: seat([reply('new-active')]) };
      await render();
      await complete('b', 'new-active');
      check(
        requests.length === 2 && requests[1].runId === runId && requests[1].agent === 'b',
        'Staggered new-run snapshots skip history and speak the active B reply.',
      );

      agents = { ...agents, a: seat([reply('reconnect')]) };
      await render();
      agents = { ...agents, a: seat([reply('reconnect')], 'reconnecting') };
      await render();
      agents = { ...agents, a: seat([reply('reconnect', 'completed')], 'reconnecting') };
      await render();
      check(
        speech.enabled && requests.length === 2,
        'Reconnecting keeps speech enabled and pauses playback.',
      );
      await complete('a', 'reconnect');
      check(
        requests.length === 3 && requests[2].replyId === 'reconnect',
        'A reply completed during reconnect speaks once after reconnection.',
      );

      agents = { ...agents, a: seat([reply('stopped')]) };
      await render();
      speech.stop();
      await wait();
      await complete('a', 'stopped');
      check(
        requests.length === 3,
        'Stop audio suppresses the active reply when it later completes.',
      );

      speech.disable();
      await wait();
      agents = { ...agents, a: seat([reply('reenabled')]) };
      await render();
      await speech.enable();
      await wait();
      await complete('a', 'reenabled');
      check(
        requests.length === 4 && requests[3].replyId === 'reenabled',
        'Explicit re-enable includes a reply already in progress.',
      );

      agents = { ...agents, b: seat([reply('during-test')]) };
      await render();
      await speech.test('b');
      await complete('b', 'during-test');
      await until(() => !speech.testing);
      check(
        requests.length === 5 && requests[4].kind === 'test',
        'Voice testing does not replay active agent replies.',
      );

      preview = true;
      await render();
      check(!speech.enabled, 'Preview still disables automatic speech.');
      window.speechCheckResult = { passed: results.length, requests, results };
    } catch (error) {
      window.speechCheckResult = { error: String(error), requests, results };
    } finally {
      speech.stop();
      window.fetch = originalFetch;
      await render();
    }
  }
  void render();
}
