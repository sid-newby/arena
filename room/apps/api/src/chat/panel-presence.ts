import { readFileSync } from 'node:fs';
import type { AgentId, Pose } from './chat.types.js';

export const ROOM_TOOL_VERSION = 6;
export const PANEL_TARGETS = ['audience', 'peer', 'center'] as const;
export type PanelTarget = (typeof PANEL_TARGETS)[number];

export const FACE_PANEL_DESCRIPTION =
  'Turn your own panel toward the audience, toward the other model, or center it to recover its default forward position. This changes orientation only; it does not send a message. Your next pose choice takes over from any manual adjustment.';
export const SET_POSE_DESCRIPTION =
  'Set your own panel direction. Use front to face the audience or center/reset. To face the other model, seat A uses right and seat B uses left. Your next pose choice takes over from any manual adjustment.';

export function panelPose(agent: AgentId, target: PanelTarget): Pose {
  return target === 'peer' ? { a: 'right' as const, b: 'left' as const }[agent] : 'front';
}

export function panelPresenceInstructions(): string {
  return readFileSync(
    new URL('../../../../skills/panel-presence/SKILL.md', import.meta.url),
    'utf8',
  );
}
