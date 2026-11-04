export type RoomId = 'hangout' | 'debate' | 'prismatic';

/** The stage is its own Vite app on the next port, so its link is absolute. */
export const rooms: ReadonlyArray<{ id: RoomId; href: string; label: string }> = [
  { id: 'hangout', href: '/', label: 'Hangout' },
  { id: 'debate', href: '/debate', label: 'Debate' },
  { id: 'prismatic', href: 'http://127.0.0.1:58243/', label: 'Prismatic Research Center' },
];

export function currentRoom(pathname: string = window.location.pathname): RoomId {
  const path = pathname.replace(/\/$/, '') || '/';
  return rooms.find((room) => room.href === path)?.id ?? 'hangout';
}
