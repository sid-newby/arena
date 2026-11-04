import { JSONUIProvider, Renderer } from '@json-render/react';
import { catalog } from '@/stage/catalog';
import { registry } from '@/stage/registry';
import { demoScene } from '@/stage/demo';

const roomOrigin = 'http://127.0.0.1:58241';
const rooms = [
  { id: 'hangout', href: `${roomOrigin}/`, label: 'Hangout' },
  { id: 'debate', href: `${roomOrigin}/debate`, label: 'Debate' },
  { id: 'prismatic', href: '/', label: 'Prismatic Research Center' },
] as const;

export default function App() {
  const prompt = catalog.prompt();
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
      </header>
      <div className="research-body">
        <JSONUIProvider registry={registry}>
          <Renderer spec={demoScene} registry={registry} />
        </JSONUIProvider>
        <aside className="research-panel" aria-label="Scene">
          <p>Catalog prompt: {prompt.length.toLocaleString()} characters.</p>
          <p>Components: {catalog.componentNames.join(', ')}.</p>
        </aside>
      </div>
    </div>
  );
}
