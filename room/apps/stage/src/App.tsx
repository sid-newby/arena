import { useCallback, useEffect, useRef } from 'react';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { catalog } from '@/stage/catalog';
import { registry } from '@/stage/registry';
import { mockAgent } from '@/agent/mock';
import { playStream } from '@/stream/client';
import { stateStore, useStage } from '@/stream/store';

const roomOrigin = 'http://127.0.0.1:58241';
const rooms = [
  { id: 'hangout', href: `${roomOrigin}/`, label: 'Hangout' },
  { id: 'debate', href: `${roomOrigin}/debate`, label: 'Debate' },
  { id: 'prismatic', href: '/', label: 'Prismatic Research Center' },
] as const;

export default function App() {
  const spec = useStage((store) => store.spec);
  const patches = useStage((store) => store.patches);
  const log = useStage((store) => store.log);
  const stream = useRef<AbortController>(null);
  const replay = useCallback(() => {
    stream.current?.abort();
    const controller = new AbortController();
    stream.current = controller;
    void playStream(mockAgent(), controller.signal);
  }, []);
  useEffect(() => {
    replay();
    return () => stream.current?.abort();
  }, [replay]);
  const ready = spec?.root !== undefined && spec.elements?.[spec.root] !== undefined;
  return (
    <div className="research">
      <header className="research-header">
        <h1 className="wordmark">
          arena<span aria-hidden="true">.</span>
        </h1>
        <nav className="room-nav" aria-label="Rooms">
          {rooms.map((room) => (
            <a
              key={room.id}
              href={room.href}
              aria-current={room.id === 'prismatic' ? 'page' : undefined}
            >
              {room.label}
            </a>
          ))}
        </nav>
        <button type="button" className="replay" onClick={replay}>
          Replay scene
        </button>
      </header>
      <div className="research-body">
        <JSONUIProvider registry={registry} store={stateStore}>
          {ready ? (
            <Renderer spec={spec} registry={registry} />
          ) : (
            <section className="stage-viewport" aria-label="Empty stage" />
          )}
        </JSONUIProvider>
        <aside className="research-panel" aria-label="Scene">
          <p>
            {patches} patches applied · catalog prompt {catalog.prompt().length.toLocaleString()}{' '}
            characters
          </p>
          <ol className="patch-log" aria-label="Patch log">
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
