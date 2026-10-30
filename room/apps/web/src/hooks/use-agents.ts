import { subscribeRoomEvents } from '@/lib/room-events';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  agentIds,
  api,
  emptySnapshot,
  parseScopedCatalog,
  parseSnapshot,
  parseRunReference,
  type AgentId,
  type AgentInfo,
  type Snapshot,
} from '@/lib/agents';
import { assertSendScope, CatalogRefresh, type SendScope } from '@/lib/run-scope';
import { ExpressionClock } from '@/lib/panel-expression';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type AgentState = {
  info?: AgentInfo;
  snapshot: Snapshot;
  connection: Connection;
  error?: string;
  pending: boolean;
};
type Room = Record<AgentId, AgentState>;
const initialAgent: AgentState = {
  snapshot: emptySnapshot,
  connection: 'connecting',
  pending: false,
};

async function stopRun(runId: string, signal: AbortSignal) {
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/stop`, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error('Could not stop the conversation. Try again.');
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError')
      throw new Error('The stop request timed out. Try stopping the conversation again.', {
        cause,
      });
    throw cause;
  }
}

export function useAgents() {
  const [agents, setAgents] = useState<Room>({ a: initialAgent, b: initialAgent });
  const [generation, setGeneration] = useState(0);
  const [apiError, setApiError] = useState<string>();
  const busy = useRef(new Set<string>());
  const [runId, setRunId] = useState<string>();
  const activeScope = useRef<{
    run: { id: string; revision: number };
    abort: AbortController;
    generation: number;
  }>(undefined);

  const update = useCallback((id: AgentId, change: Partial<AgentState>) => {
    setAgents((previous) => ({ ...previous, [id]: { ...previous[id], ...change } }));
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const subscriptions: (() => void)[] = [];
    let catalogRefresh: CatalogRefresh | undefined;
    async function connect() {
      try {
        const run = await api('/api/runs/current', parseRunReference, { signal: abort.signal });
        if (abort.signal.aborted) return;
        activeScope.current = { run, abort, generation };
        setRunId(run.id);
        const base = `/api/runs/${encodeURIComponent(run.id)}`;
        const loadCatalog = () =>
          api(`${base}/agents`, (value) => parseScopedCatalog(value, run.id), {
            signal: abort.signal,
          });
        const catalog = await loadCatalog();
        if (abort.signal.aborted) return;
        run.revision = catalog.revision;
        let requiredRevision = catalog.revision;
        let catalogError: string | undefined;
        catalogRefresh = new CatalogRefresh({
          runId: run.id,
          revision: catalog.revision,
          load: loadCatalog,
          apply: (latest) => {
            if (abort.signal.aborted) return;
            catalogError = undefined;
            run.revision = latest.revision;
            requiredRevision = Math.max(requiredRevision, latest.revision);
            for (const info of latest.agents) update(info.id, { info, error: undefined });
          },
          fail: (error) => {
            if (abort.signal.aborted) return;
            const message =
              error instanceof Error
                ? error.message
                : 'Could not refresh model information. Reconnect to continue.';
            catalogError = message;
            for (const id of agentIds) update(id, { error: message });
          },
        });
        const observeRevision = (revision: number | undefined) => {
          if (revision === undefined) return;
          if (revision > requiredRevision) {
            requiredRevision = revision;
            for (const id of agentIds) update(id, { info: undefined });
          }
          catalogRefresh?.observe(revision);
        };
        await Promise.all(
          catalog.agents.map(async (info) => {
            update(info.id, { info });
            try {
              const clock = new ExpressionClock();
              async function readSnapshot() {
                const requestStartedAt = performance.now();
                const snapshot = await api(
                  `${base}/agents/${info.id}`,
                  (value) => parseSnapshot(value, clock, requestStartedAt, run.id),
                  { signal: abort.signal },
                );
                return { snapshot, roundTrip: performance.now() - requestStartedAt };
              }
              let sample = await readSnapshot();
              for (let retry = 0; sample.roundTrip > 100 && retry < 2; retry++) {
                sample = await readSnapshot();
              }
              const snapshot = sample.snapshot;
              if (abort.signal.aborted) return;
              observeRevision(snapshot.revision);
              update(info.id, { snapshot, connection: 'connecting' });
              const unsubscribe = subscribeRoomEvents(run.id, info.id, {
                message: (event) => {
                  if (abort.signal.aborted) return;
                  try {
                    const incoming = parseSnapshot(
                      JSON.parse(event.data),
                      clock,
                      undefined,
                      run.id,
                    );
                    observeRevision(incoming.revision);
                    update(info.id, {
                      snapshot: incoming,
                      connection: 'connected',
                      error: catalogError,
                    });
                  } catch (error) {
                    update(info.id, {
                      connection: 'disconnected',
                      error: error instanceof Error ? error.message : 'Unreadable agent update.',
                    });
                    unsubscribe();
                  }
                },
                error: () => {
                  if (!abort.signal.aborted) update(info.id, { connection: 'reconnecting' });
                },
              });
              subscriptions.push(unsubscribe);
            } catch (error) {
              if (!abort.signal.aborted)
                update(info.id, {
                  connection: 'disconnected',
                  error: error instanceof Error ? error.message : 'Could not connect.',
                });
            }
          }),
        );
      } catch (error) {
        if (abort.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Could not reach the API.';
        setApiError(message);
        for (const id of agentIds) update(id, { connection: 'disconnected' });
      }
    }
    void connect();
    return () => {
      catalogRefresh?.close();
      abort.abort();
      if (activeScope.current?.abort === abort) activeScope.current = undefined;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [generation, update]);

  async function send(id: AgentId, text: string, requestId: string, requested: SendScope) {
    const scope = activeScope.current;
    if (!scope || scope.abort.signal.aborted) throw new Error('Wait for the run to connect.');
    assertSendScope(scope.run.id, requested);
    const busyKey = `${scope.run.id}:${id}`;
    if (busy.current.has(busyKey)) throw new Error('This agent is already receiving a message.');
    busy.current.add(busyKey);
    update(id, { pending: true });
    try {
      await api(
        `/api/runs/${encodeURIComponent(scope.run.id)}/agents/${id}/turns`,
        (value) => {
          if (
            typeof value !== 'object' ||
            value === null ||
            !('turnId' in value) ||
            typeof value.turnId !== 'string'
          ) {
            throw new Error(
              'The API did not confirm this message. Retry to check the same request.',
            );
          }
          return value;
        },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            text,
            expectedRevision: requested.revision,
          }),
          signal: AbortSignal.any([scope.abort.signal, AbortSignal.timeout(30000)]),
        },
      );
    } finally {
      busy.current.delete(busyKey);
      if (activeScope.current === scope) update(id, { pending: false });
    }
  }

  async function stop(id: AgentId) {
    const scope = activeScope.current;
    if (!scope) throw new Error('Wait for the run to connect.');
    const response = await fetch(
      `/api/runs/${encodeURIComponent(scope.run.id)}/agents/${id}/turns/current`,
      {
        method: 'DELETE',
        signal: AbortSignal.any([scope.abort.signal, AbortSignal.timeout(15000)]),
      },
    );
    if (!response.ok) throw new Error(`Could not stop ${id}. Try again.`);
  }

  async function stopConversation() {
    const scope = activeScope.current;
    if (!scope) throw new Error('Wait for the run to connect.');
    await stopRun(scope.run.id, scope.abort.signal);
  }

  const reconnect = useCallback(() => {
    setApiError(undefined);
    setAgents((previous) => ({
      a: { ...previous.a, pending: false, connection: 'connecting' },
      b: { ...previous.b, pending: false, connection: 'connecting' },
    }));
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    window.addEventListener('lilbits-run-changed', reconnect);
    return () => window.removeEventListener('lilbits-run-changed', reconnect);
  }, [reconnect]);

  return { runId, agents, apiError, send, stop, stopConversation, reconnect };
}
