import { useRef, useState } from 'react';
import { api, type AgentId } from '@/lib/agents';
import type { SideConversationSnapshot } from '@/lib/messaging';

export function useSideConversation(
  runId: string | undefined,
  seat: AgentId,
  snapshot?: SideConversationSnapshot,
) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const submission = useRef<{ text: string; revision: number; requestId: string }>(undefined);
  const flight = useRef(false);
  async function send() {
    const text = draft.trim();
    if (!runId || !snapshot || !text || flight.current) return;
    flight.current = true;
    setPending(true);
    setError(undefined);
    const previous = submission.current;
    const request =
      previous?.text === text && previous.revision === snapshot.revision
        ? previous
        : { text, revision: snapshot.revision, requestId: crypto.randomUUID() };
    submission.current = request;
    try {
      await api(
        `/api/runs/${encodeURIComponent(runId)}/agents/${seat}/side-conversation`,
        (value) => {
          if (
            !value ||
            typeof value !== 'object' ||
            !('turnId' in value) ||
            typeof value.turnId !== 'string'
          )
            throw new Error('The API did not confirm your side message. Retry the same request.');
          return value.turnId;
        },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.requestId,
            text: request.text,
            expectedRevision: request.revision,
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      submission.current = undefined;
      setDraft((current) => (current.trim() === text ? '' : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the side message.');
    } finally {
      flight.current = false;
      setPending(false);
    }
  }
  async function stop() {
    if (!runId || stopping) return;
    setStopping(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/agents/${seat}/side-conversation/turns/current`,
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error('Could not stop the side conversation. Try again.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stop the side conversation.');
    } finally {
      setStopping(false);
    }
  }
  return { draft, setDraft, error, pending, stopping, send, stop };
}
