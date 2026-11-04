export type RoomId = 'hangout' | 'debate' | 'prismatic';

export const rooms: ReadonlyArray<{ id: RoomId; path: string; label: string }> = [
  { id: 'hangout', path: '/', label: 'Hangout' },
  { id: 'debate', path: '/debate', label: 'Debate' },
  { id: 'prismatic', path: '/prismatic', label: 'Prismatic Research Center' },
];

export function currentRoom(pathname: string = window.location.pathname): RoomId {
  const path = pathname.replace(/\/$/, '') || '/';
  return rooms.find((room) => room.path === path)?.id ?? 'hangout';
}
