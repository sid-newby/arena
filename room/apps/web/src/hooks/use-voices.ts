import { useCallback, useEffect, useState } from 'react';
import { api, type AgentId } from '@/lib/agents';

export type Voice = { alias: string; id: string; custom: boolean };
export type VoiceCatalog = {
  voices: Voice[];
  defaults: Record<AgentId, string>;
  selection: Record<AgentId, string>;
  runId: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function seats(source: Record<string, unknown>): Record<AgentId, string> {
  return {
    a: typeof source.a === 'string' ? source.a : '',
    b: typeof source.b === 'string' ? source.b : '',
  };
}
function parseCatalog(value: unknown): VoiceCatalog {
  if (
    !record(value) ||
    !Array.isArray(value.voices) ||
    !record(value.defaults) ||
    !record(value.selection) ||
    typeof value.runId !== 'string'
  )
    throw new Error('Unreadable voice catalog.');
  const voices = value.voices.map((entry) => {
    if (!record(entry) || typeof entry.alias !== 'string' || typeof entry.id !== 'string')
      throw new Error('Unreadable voice catalog.');
    return { alias: entry.alias, id: entry.id, custom: entry.custom === true };
  });
  return {
    voices,
    defaults: seats(value.defaults),
    selection: seats(value.selection),
    runId: value.runId,
  };
}
function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  };
}

export function useVoices(runId: string | undefined) {
  const [catalog, setCatalog] = useState<VoiceCatalog>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!runId) return;
      try {
        setCatalog(
          await api(`/api/speech/voices?runId=${encodeURIComponent(runId)}`, parseCatalog, {
            signal,
          }),
        );
        setError(undefined);
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load the voice catalog.');
      }
    },
    [runId],
  );
  /* oxlint-disable react/set-state-in-effect -- The catalog is external server state loaded per run. */
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(undefined);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  /* oxlint-enable react/set-state-in-effect */
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The voice change was not saved.');
    } finally {
      setBusy(false);
    }
  }
  return {
    catalog,
    error,
    busy,
    select: (seat: AgentId, alias: string) =>
      runId
        ? mutate(() =>
            api(
              `/api/speech/voices/${encodeURIComponent(runId)}/${seat}`,
              () => undefined,
              json('PUT', { alias }),
            ),
          )
        : Promise.resolve(),
    add: (alias: string, id: string) =>
      mutate(() => api('/api/speech/voices', () => undefined, json('POST', { alias, id }))),
    remove: (alias: string) =>
      mutate(() =>
        api(`/api/speech/voices/${encodeURIComponent(alias)}`, () => undefined, json('DELETE')),
      ),
  };
}
