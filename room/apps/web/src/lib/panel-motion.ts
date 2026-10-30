import type { ExpressionMood } from './panel-expression';
import type { AgentId } from './agents';

export type ActivityFrame = {
  connected: boolean;
  phase: 'idle' | 'thinking' | 'writing';
  reply: { id: string; status: 'streaming' | 'completed' | 'stopped' | 'failed' } | null;
};
export type ActivityCue = 'attend' | 'speak' | 'settle';

export class ActivityTimeline {
  private previous: ActivityFrame | undefined;
  private enabled = false;

  observe(frame: ActivityFrame, enabled: boolean, expressing: boolean): ActivityCue | null {
    const previous = this.previous;
    const wasEnabled = this.enabled;
    this.previous = frame;
    this.enabled = enabled;
    if (!enabled || !wasEnabled || !previous?.connected || !frame.connected || expressing)
      return null;
    if (frame.phase !== 'idle' && previous.phase === 'idle') return 'attend';
    if (frame.phase === 'writing' && previous.phase !== 'writing') return 'speak';
    if (
      frame.phase === 'idle' &&
      previous.phase !== 'idle' &&
      frame.reply?.status === 'completed' &&
      previous.reply?.id === frame.reply.id &&
      previous.reply.status === 'streaming'
    )
      return 'settle';
    return null;
  }
}

const neutral = 'translateZ(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
const cadence = {
  a: { pace: 1, direction: -1, weight: 1 },
  b: { pace: 1.18, direction: 1, weight: 0.8 },
};

function gesture(transform: string, peak: number, release: number): Keyframe[] {
  return [
    { transform: neutral, offset: 0 },
    { transform, offset: peak },
    { transform, offset: release },
    { transform: neutral, offset: 1 },
  ];
}

export function expressionMotion(mood: ExpressionMood, intensity: number, agent: AgentId) {
  const { direction, weight } = cadence[agent];
  const strength = intensity * weight;
  const gestures: Record<ExpressionMood, Keyframe[]> = {
    annoyed: gesture(`rotateY(${direction * strength * 0.8}deg)`, 0.08, 0.16),
    grumpy: gesture(`rotateX(${strength * 1.5}deg) translateZ(${-strength * 4}px)`, 0.2, 0.48),
    amused: gesture(`translateZ(${strength * 10}px) rotateX(${-strength * 0.8}deg)`, 0.3, 0.42),
    skeptical: gesture(
      `rotateY(${direction * strength * 3.4}deg) rotateZ(${direction * strength * 0.45}deg)`,
      0.26,
      0.66,
    ),
    startled: gesture(`translateZ(${-strength * 20}px) rotateX(${strength * 2}deg)`, 0.1, 0.2),
  };
  return gestures[mood];
}

export function activityMotion(cue: ActivityCue, agent: AgentId) {
  const { pace, direction, weight } = cadence[agent];
  const gestures: Record<ActivityCue, { keyframes: Keyframe[]; duration: number }> = {
    attend: {
      keyframes: gesture(`translateZ(${12 * weight}px) rotateX(${-weight}deg)`, 0.25, 0.52),
      duration: 1000 * pace,
    },
    speak: {
      keyframes: gesture(`rotateY(${direction * weight * 0.6}deg)`, 0.28, 0.4),
      duration: 700 * pace,
    },
    settle: {
      keyframes: gesture(`rotateX(${weight * 1.4}deg)`, 0.26, 0.34),
      duration: 800 * pace,
    },
  };
  return gestures[cue];
}
