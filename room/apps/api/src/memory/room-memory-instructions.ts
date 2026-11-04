import { readFileSync } from 'node:fs';

type MemoryScope = 'public room' | 'private whispers with Sid' | 'private whispers with your peer';

export function roomMemoryInstructions(scope: MemoryScope, enabled: boolean): string {
  const status = enabled ? 'configured for capture and recall' : 'off here. Skip recall_room';
  const guide = readFileSync(
    new URL('../../../../skills/room-memory/SKILL.md', import.meta.url),
    'utf8',
  );
  return `Honcho memory for ${scope} is ${status}.\n\n${guide}`;
}
