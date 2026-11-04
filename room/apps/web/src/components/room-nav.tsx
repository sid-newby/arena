import { rooms, type RoomId } from '@/lib/rooms';
import './room-nav.css';

export function RoomNav({ current }: { current: RoomId }) {
  return (
    <>
      <h1 className="wordmark">
        arena<span aria-hidden="true">.</span>
      </h1>
      <nav className="room-nav" aria-label="Rooms">
        {rooms.map((room) => (
          <a key={room.id} href={room.path} aria-current={room.id === current ? 'page' : undefined}>
            {room.label}
          </a>
        ))}
      </nav>
    </>
  );
}
