type Channel = 'a' | 'b' | 'maestro';
type Listener = { message: (event: { data: string }) => void; error: () => void };
type Connection = {
  stream?: EventSource;
  visibility: () => void;
  listeners: Map<Channel, Set<Listener>>;
  latest: Map<Channel, string>;
};

const connections = new Map<string, Connection>();

export function subscribeRoomEvents(runId: string, channel: Channel, listener: Listener) {
  let connection = connections.get(runId);
  if (!connection) {
    const entry: Connection = { visibility: () => {}, listeners: new Map(), latest: new Map() };
    connections.set(runId, entry);
    connection = entry;
    entry.visibility = () => {
      if (document.hidden) {
        entry.stream?.close();
        entry.stream = undefined;
        entry.latest.clear();
        return;
      }
      if (entry.stream) return;
      const stream = new EventSource(`/api/runs/${encodeURIComponent(runId)}/maestro/room-events`);
      entry.stream = stream;
      for (const name of ['a', 'b', 'maestro'] as const) {
        stream.addEventListener(name, (event) => {
          if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return;
          entry.latest.set(name, event.data);
          entry.listeners
            .get(name)
            ?.forEach((subscriber) => subscriber.message({ data: event.data }));
        });
      }
      stream.addEventListener('error', () => {
        for (const listeners of entry.listeners.values())
          listeners.forEach((subscriber) => subscriber.error());
      });
    };
    document.addEventListener('visibilitychange', entry.visibility);
    entry.visibility();
  }
  const listeners = connection.listeners.get(channel) ?? new Set<Listener>();
  connection.listeners.set(channel, listeners);
  listeners.add(listener);
  const latest = connection.latest.get(channel);
  if (latest !== undefined)
    queueMicrotask(() => {
      if (listeners.has(listener)) listener.message({ data: latest });
    });
  return () => {
    if (!listeners.delete(listener)) return;
    if ([...connection.listeners.values()].every((subscribers) => subscribers.size === 0)) {
      connection.stream?.close();
      document.removeEventListener('visibilitychange', connection.visibility);
      connections.delete(runId);
    }
  };
}
