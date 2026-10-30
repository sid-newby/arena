import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/agents';
import { subscribeRoomEvents } from '@/lib/room-events';
import {
  parseCurrentRun,
  parseMaestroSnapshot,
  parseMaestroTurn,
  maestroCancellationTarget,
  type MaestroSnapshot,
} from '@/lib/maestro';

type RunState = {
  snapshot?: MaestroSnapshot;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  error?: string;
  draft: string;
  pending: boolean;
  stopping: boolean;
};
type Submission = { text: string; requestId: string; cancelRequested: boolean };
type ConnectionLease = { id?: string; generation: number; controller: AbortController };
const initialState: RunState = {
  connection: 'connecting',
  draft: '',
  pending: false,
  stopping: false,
};

export function useMaestro(providedRunId?: string) {
  const [discoveredRunId, setDiscoveredRunId] = useState<string>();
  const [discoveryError, setDiscoveryError] = useState<string>();
  const [states, setStates] = useState<Record<string, RunState>>({});
  const [generation, setGeneration] = useState(0);
  const discovered = useRef<string>(undefined);
  const activeLease = useRef<ConnectionLease>(undefined);
  const submissions = useRef(new Map<string, Submission>());
  const requestTargets = useRef(new Map<string, Submission>());
  const attempts = useRef(new Map<string, { request: Submission; controller: AbortController }>());
  const submitting = useRef(new Set<string>());
  const stoppingRequests = useRef(new Set<string>());
  const runId = providedRunId ?? discoveredRunId;
  const state = runId ? (states[runId] ?? initialState) : initialState;

  const update = useCallback(
    (id: string, change: Partial<RunState> | ((current: RunState) => Partial<RunState>)) => {
      setStates((previous) => {
        const current = previous[id] ?? initialState;
        return {
          ...previous,
          [id]: { ...current, ...(typeof change === 'function' ? change(current) : change) },
        };
      });
    },
    [],
  );

  useEffect(() => {
    const lease: ConnectionLease = { generation, controller: new AbortController() };
    activeLease.current = lease;
    let unsubscribe: (() => void) | undefined;
    async function connect() {
      try {
        const id =
          providedRunId ??
          discovered.current ??
          (await api('/api/runs/current', parseCurrentRun, {
            signal: AbortSignal.any([lease.controller.signal, AbortSignal.timeout(15000)]),
          }));
        if (lease.controller.signal.aborted) return;
        lease.id = id;
        if (!providedRunId) {
          discovered.current = id;
          setDiscoveredRunId(id);
        }
        const snapshot = await api(
          `/api/runs/${encodeURIComponent(id)}/maestro`,
          (value) => parseMaestroSnapshot(value, id),
          { signal: AbortSignal.any([lease.controller.signal, AbortSignal.timeout(15000)]) },
        );
        if (lease.controller.signal.aborted) return;
        setDiscoveryError(undefined);
        update(id, { snapshot, connection: 'connecting', error: undefined });
        unsubscribe = subscribeRoomEvents(id, 'maestro', {
          message: (event) => {
            if (lease.controller.signal.aborted) return;
            try {
              update(id, {
                snapshot: parseMaestroSnapshot(JSON.parse(event.data), id),
                connection: 'connected',
                error: undefined,
              });
            } catch (cause) {
              update(id, {
                connection: 'disconnected',
                error: cause instanceof Error ? cause.message : 'Unreadable Maestro update.',
              });
              unsubscribe?.();
            }
          },
          error: () => {
            if (!lease.controller.signal.aborted) update(id, { connection: 'reconnecting' });
          },
        });
      } catch (cause) {
        if (lease.controller.signal.aborted) return;
        const error = cause instanceof Error ? cause.message : 'Could not connect to Maestro.';
        if (lease.id) update(lease.id, { connection: 'disconnected', error });
        else setDiscoveryError(error);
      }
    }
    void connect();
    return () => {
      lease.controller.abort();
      unsubscribe?.();
      if (activeLease.current === lease) activeLease.current = undefined;
    };
  }, [providedRunId, generation, update]);

  async function refresh(id: string, lease: ConnectionLease, current: () => boolean = () => true) {
    const snapshot = await api(
      `/api/runs/${encodeURIComponent(id)}/maestro`,
      (value) => parseMaestroSnapshot(value, id),
      { signal: AbortSignal.any([lease.controller.signal, AbortSignal.timeout(15000)]) },
    );
    if (!lease.controller.signal.aborted && activeLease.current === lease && current())
      update(id, { snapshot });
  }

  async function send() {
    const text = state.draft.trim();
    const lease = activeLease.current;
    if (
      !runId ||
      !lease ||
      lease.id !== runId ||
      !text ||
      text.length > 16000 ||
      submitting.current.has(runId) ||
      stoppingRequests.current.has(runId) ||
      state.stopping ||
      state.snapshot?.status === 'working'
    )
      return;
    const id = runId;
    const previous = submissions.current.get(id);
    const request =
      previous?.text === text && !previous.cancelRequested
        ? previous
        : { text, requestId: crypto.randomUUID(), cancelRequested: false };
    submissions.current.set(id, request);
    requestTargets.current.set(id, request);
    const attempt = { request, controller: new AbortController() };
    attempts.current.set(id, attempt);
    submitting.current.add(id);
    update(id, { pending: true, error: undefined });
    try {
      await api(`/api/runs/${encodeURIComponent(id)}/maestro/turns`, parseMaestroTurn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: request.text, requestId: request.requestId }),
        signal: AbortSignal.any([
          lease.controller.signal,
          attempt.controller.signal,
          AbortSignal.timeout(30000),
        ]),
      });
      if (lease.controller.signal.aborted || activeLease.current !== lease) return;
      submissions.current.delete(id);
      if (!request.cancelRequested)
        update(id, (current) => ({ draft: current.draft.trim() === text ? '' : current.draft }));
      try {
        await refresh(id, lease, () => !request.cancelRequested);
      } catch {
        if (
          !request.cancelRequested &&
          !lease.controller.signal.aborted &&
          activeLease.current === lease
        )
          update(id, {
            connection: 'reconnecting',
            error: 'Your message was accepted. Reconnect to check its response.',
          });
      }
    } catch (cause) {
      if (
        !request.cancelRequested &&
        !lease.controller.signal.aborted &&
        activeLease.current === lease
      )
        update(id, {
          error: cause instanceof Error ? cause.message : 'Could not send to Maestro.',
        });
    } finally {
      if (attempts.current.get(id) === attempt) attempts.current.delete(id);
      submitting.current.delete(id);
      if (request.cancelRequested && submissions.current.get(id) === request)
        submissions.current.delete(id);
      update(id, { pending: false });
    }
  }

  async function stop() {
    const lease = activeLease.current;
    if (!runId || !lease || lease.id !== runId || stoppingRequests.current.has(runId)) return;
    const id = runId;
    const pending =
      state.pending || submitting.current.has(id) ? requestTargets.current.get(id) : undefined;
    const target = maestroCancellationTarget(state.snapshot, pending?.requestId);
    if (!target) return;
    if (pending) pending.cancelRequested = true;
    stoppingRequests.current.add(id);
    update(id, { stopping: true, error: undefined });
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}/maestro/turns/current`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
        signal: AbortSignal.any([lease.controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error('Could not stop Maestro. Try again.');
      const attempt = attempts.current.get(id);
      if (pending && attempt?.request === pending) attempt.controller.abort();
      await refresh(id, lease);
    } catch (cause) {
      if (!lease.controller.signal.aborted && activeLease.current === lease)
        update(id, { error: cause instanceof Error ? cause.message : 'Could not stop Maestro.' });
    } finally {
      stoppingRequests.current.delete(id);
      update(id, { stopping: false });
    }
  }

  function setDraft(draft: string) {
    if (runId) update(runId, { draft });
  }

  function reconnect() {
    if (runId) update(runId, { connection: 'reconnecting', error: undefined });
    setDiscoveryError(undefined);
    setGeneration((value) => value + 1);
  }

  return {
    ...state,
    runId,
    connection: discoveryError ? 'disconnected' : state.connection,
    error: discoveryError || state.error,
    setDraft,
    send,
    stop,
    reconnect,
    canStop: state.pending || Boolean(maestroCancellationTarget(state.snapshot)),
  };
}
