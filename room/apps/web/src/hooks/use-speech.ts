import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentState } from './use-agents';
import { agentIds } from '@/lib/agents';
import { SpeechQueue, SpeechTracker, SpeechInterruptions, type Speaker } from '@/lib/speech-queue';

type Agents = Record<Speaker, AgentState>;
export function useSpeech(agents: Agents, preview: boolean, runId?: string) {
  const playbackRun = useRef(runId);
  const latest = useRef(agents);
  useEffect(() => {
    latest.current = agents;
  }, [agents]);
  const queue = useRef<SpeechQueue | undefined>(undefined);
  const tracker = useRef(new SpeechTracker());
  const testingRef = useRef(false);
  const lifecycle = useRef<object>({});
  const interruptions = useRef(new SpeechInterruptions());
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState('Checking Cartesia setup…');
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [status, setStatus] = useState('Speech off');
  const [error, setError] = useState<string>();
  const baseline = useCallback(() => {
    for (const agent of agentIds)
      tracker.current.baseline(agent, latest.current[agent].snapshot.messages);
  }, []);
  const stop = useCallback(() => {
    lifecycle.current = {};
    testingRef.current = false;
    setTesting(false);
    setStarting(false);
    setFeedback(true);
    baseline();
    interruptions.current.clear();
    queue.current?.stop();
    setBusy(false);
    setStatus('Audio stopped · waiting for new replies');
  }, [baseline]);
  const disable = useCallback(() => {
    stop();
    setEnabled(false);
    setStatus('Speech off');
    setFeedback(false);
  }, [stop]);
  /* oxlint-disable react/set-state-in-effect -- Document/HMR lifecycle must reset external playback and its opt-in. */
  useEffect(() => {
    setEnabled(false);
    setBusy(false);
    setTesting(false);
    setStarting(false);
    setFeedback(false);
    setStatus('Speech off');
    testingRef.current = false;
    const controller = new AbortController();
    void fetch('/api/speech/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Speech server unavailable.');
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== 'object' ||
          !('ready' in data) ||
          typeof data.ready !== 'boolean' ||
          !('detail' in data) ||
          typeof data.detail !== 'string'
        )
          throw new Error('Unreadable speech setup.');
        setReady(data.ready);
        setDetail(data.detail);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setDetail('Speech server unavailable. Reload after configuring Cartesia.');
      });
    return () => {
      controller.abort();
      lifecycle.current = {};
      testingRef.current = false;
      queue.current?.close();
      queue.current = undefined;
    };
  }, []);
  /* oxlint-enable react/set-state-in-effect */
  const connectionsReady = agentIds.every(
    (id) =>
      agents[id].connection === 'connected' && (!runId || agents[id].snapshot.runId === runId),
  );
  /* oxlint-disable react/set-state-in-effect -- Synchronize the external audio queue with authoritative connection/turn events. */
  useEffect(() => {
    if (playbackRun.current !== runId) {
      playbackRun.current = runId;
      tracker.current = new SpeechTracker();
      disable();
      return;
    }
    const aInterrupted = interruptions.current.observe('a', agents.a.snapshot.messages);
    const bInterrupted = interruptions.current.observe('b', agents.b.snapshot.messages);
    const interrupted = aInterrupted.interrupted || bInterrupted.interrupted;
    if (testingRef.current) {
      baseline();
      if (preview) stop();
      return;
    }
    if (!enabled) return;
    if (preview || !connectionsReady) {
      disable();
      return;
    }
    if (interrupted) {
      queue.current?.stop();
      setBusy(false);
      for (const [agent, observation] of [
        ['a', aInterrupted],
        ['b', bInterrupted],
      ] as const)
        tracker.current.baseline(
          agent,
          agents[agent].snapshot.messages.filter((reply) =>
            observation.previousReplyIds.has(reply.id),
          ),
        );
      setStatus('Audio stopped · waiting for new replies');
    }
    for (const agent of agentIds) {
      try {
        const segments = tracker.current.collect(agent, agents[agent].snapshot.messages);
        const notice = tracker.current.takeNotice();
        if (notice) setError(notice);
        queue.current?.enqueue(segments.map((segment) => ({ ...segment, runId })));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Speech queue failed.');
        disable();
      }
    }
  }, [agents, enabled, preview, connectionsReady, disable, stop, baseline, runId]);
  /* oxlint-enable react/set-state-in-effect */
  async function prepare() {
    const operation = {};
    lifecycle.current = operation;
    setStarting(true);
    setError(undefined);
    try {
      if (!queue.current)
        queue.current = new SpeechQueue(
          (text, active) => {
            setStatus(text);
            setBusy(active);
            if (!active && testingRef.current) {
              baseline();
              testingRef.current = false;
              setTesting(false);
            }
          },
          (message) => {
            baseline();
            testingRef.current = false;
            setTesting(false);
            setError(message);
            setBusy(false);
            setEnabled(false);
          },
        );
      await queue.current.resume();
      if (operation !== lifecycle.current) return false;
      baseline();
      return true;
    } catch {
      setError('Audio playback could not start. Try enabling speech again.');
      testingRef.current = false;
      setTesting(false);
      return false;
    } finally {
      setStarting(false);
    }
  }
  async function enable() {
    if (!ready || preview || !connectionsReady || starting || testingRef.current) return;
    if (await prepare()) {
      setEnabled(true);
      setFeedback(false);
      setStatus('Waiting for new replies');
    }
  }
  async function test(agent: Speaker) {
    if (!ready || starting || busy || testingRef.current || queue.current?.isBusy || preview)
      return;
    testingRef.current = true;
    setTesting(true);
    setFeedback(true);
    baseline();
    if (!(await prepare())) return;
    setBusy(true);
    try {
      queue.current?.enqueue([
        {
          agent,
          text: `Hello, this is ${agent === 'a' ? 'A' : 'B'} speaking.`,
          requestId: crypto.randomUUID(),
          test: true,
        },
      ]);
    } catch {
      testingRef.current = false;
      setTesting(false);
      setBusy(false);
      setError('Could not queue the voice test.');
    }
  }
  return {
    ready,
    detail,
    enabled,
    starting,
    busy,
    testing,
    feedback,
    status,
    error,
    connectionsReady,
    enable,
    disable,
    stop,
    test,
  };
}
