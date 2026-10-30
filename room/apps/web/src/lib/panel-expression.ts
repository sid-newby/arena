export const expressionMoods = ['annoyed', 'grumpy', 'amused', 'skeptical', 'startled'] as const;
export type ExpressionMood = (typeof expressionMoods)[number];

function isExpressionMood(value: unknown): value is ExpressionMood {
  return expressionMoods.some((mood) => mood === value);
}

export type PanelExpression = {
  id: string;
  mood: ExpressionMood;
  intensity: number;
  duration: number;
  startedAt: number;
  expiresAt: number;
};

export type ExpressionSnapshot = {
  expression: PanelExpression | null;
  serverNow: number;
  receivedAt: number;
};

export type ActiveExpression = PanelExpression & {
  elapsed: number;
  deadline: number;
};

export class ExpressionClock {
  private anchor: { serverNow: number; receivedAt: number } | undefined;
  private bestRoundTrip = Number.POSITIVE_INFINITY;

  calibrate(serverNow: number, requestStartedAt: number, receivedAt: number) {
    const roundTrip = Math.max(0, receivedAt - requestStartedAt);
    if (roundTrip > this.bestRoundTrip) return;
    this.bestRoundTrip = roundTrip;
    // Count the full round trip so delayed responses can suppress a cue, never replay it.
    this.anchor = { serverNow: serverNow + roundTrip, receivedAt };
  }

  estimate(serverNow: number, receivedAt: number) {
    const estimated = this.anchor
      ? this.anchor.serverNow + Math.max(0, receivedAt - this.anchor.receivedAt)
      : serverNow;
    const latest = Math.max(serverNow, estimated);
    this.anchor = { serverNow: latest, receivedAt };
    return latest;
  }
}

export function parseExpression(value: unknown): PanelExpression | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    !('mood' in value) ||
    !isExpressionMood(value.mood) ||
    !('intensity' in value) ||
    typeof value.intensity !== 'number' ||
    !Number.isFinite(value.intensity) ||
    value.intensity < 0 ||
    value.intensity > 1 ||
    !('duration' in value) ||
    typeof value.duration !== 'number' ||
    !Number.isInteger(value.duration) ||
    value.duration < 150 ||
    value.duration > 1500 ||
    !('startedAt' in value) ||
    typeof value.startedAt !== 'number' ||
    !Number.isFinite(value.startedAt) ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt - value.startedAt !== value.duration
  )
    throw new Error('The agent returned an unreadable expression.');
  return {
    id: value.id,
    mood: value.mood,
    intensity: value.intensity,
    duration: value.duration,
    startedAt: value.startedAt,
    expiresAt: value.expiresAt,
  };
}

export class ExpressionTimeline {
  private seen = new Set<string>();
  private active: ActiveExpression | null = null;

  observe(snapshot: ExpressionSnapshot, now: number, enabled: boolean): ActiveExpression | null {
    const expression = snapshot.expression;
    if (!expression) {
      this.active = null;
      return null;
    }
    if (!enabled) {
      this.remember(expression.id);
      this.active = null;
      return null;
    }
    if (this.active?.id === expression.id) return this.at(now);
    if (this.seen.has(expression.id)) return null;
    this.remember(expression.id);
    const elapsed =
      Math.max(0, snapshot.serverNow - expression.startedAt) +
      Math.max(0, now - snapshot.receivedAt);
    this.active =
      elapsed >= expression.duration
        ? null
        : {
            ...expression,
            elapsed,
            deadline: now + expression.duration - elapsed,
          };
    return this.active;
  }

  at(now: number): ActiveExpression | null {
    if (this.active && now >= this.active.deadline) this.active = null;
    return this.active;
  }

  private remember(id: string) {
    this.seen.add(id);
    if (this.seen.size > 64) {
      const oldest = this.seen.values().next().value;
      if (oldest) this.seen.delete(oldest);
    }
  }
}
