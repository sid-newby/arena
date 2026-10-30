import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentId } from './chat.types.js';

export const EXPRESSION_MOODS = ['annoyed', 'grumpy', 'amused', 'skeptical', 'startled'] as const;
export const EXPRESSION_COOLDOWN = 750;
export const expressionInput = z.strictObject({
  mood: z.enum(EXPRESSION_MOODS),
  intensity: z.number().min(0).max(1).default(0.35),
  duration: z.number().int().min(150).max(1500).default(900),
});
export const EXPRESS_DESCRIPTION =
  'Request a brief expressive cue on your own screen. Annoyed is one horizontal interference band; grumpy is a brightness dip with slow recovery; amused is an identity-color shimmer; skeptical is a slight held lean; startled is a short recoil and a shifted decorative signal line. Duration is 150–1500 milliseconds, intensity is 0–1. Defaults are 900ms and 0.35. Requests have a 750ms cooldown. Acceptance does not confirm browser rendering; effects may be disabled or the browser offline.';
export const CLEAR_EXPRESSION_DESCRIPTION =
  'Cancel your own temporary screen expression without changing your panel pose. Acceptance does not confirm browser rendering.';

export type PanelExpression = z.infer<typeof expressionInput> & {
  id: string;
  startedAt: number;
  expiresAt: number;
};

type ActiveExpression = {
  expression: PanelExpression;
  timer: ReturnType<typeof setTimeout>;
};

export class PanelExpressions {
  private readonly active = new Map<AgentId, ActiveExpression>();
  private readonly lastAccepted = new Map<AgentId, number>();

  constructor(private readonly changed: (agent: AgentId) => void) {}

  snapshot(agent: AgentId, now: number): PanelExpression | null {
    const expression = this.active.get(agent)?.expression;
    return expression && expression.expiresAt > now ? expression : null;
  }

  express(agent: AgentId, input: Record<string, unknown>) {
    const parsed = expressionInput.safeParse(input);
    if (!parsed.success)
      throw new Error(
        'Invalid expression. Use mood annoyed, grumpy, amused, skeptical, or startled, intensity 0–1, duration 150–1500 integer milliseconds, and no extra fields.',
      );
    const now = Date.now();
    const previous = this.lastAccepted.get(agent);
    if (previous !== undefined && now - previous < EXPRESSION_COOLDOWN)
      return {
        accepted: false as const,
        status: 'cooldown' as const,
        retryAfterMs: EXPRESSION_COOLDOWN - (now - previous),
        rendering: 'unconfirmed' as const,
      };
    const expression: PanelExpression = {
      ...parsed.data,
      id: randomUUID(),
      startedAt: now,
      expiresAt: now + parsed.data.duration,
    };
    const previousActive = this.active.get(agent);
    if (previousActive) clearTimeout(previousActive.timer);
    const timer = setTimeout(() => {
      if (this.active.get(agent)?.expression.id !== expression.id) return;
      this.active.delete(agent);
      this.changed(agent);
    }, expression.duration);
    timer.unref();
    this.active.set(agent, { expression, timer });
    this.lastAccepted.set(agent, now);
    this.changed(agent);
    return {
      accepted: true as const,
      status: 'accepted' as const,
      expression,
      rendering: 'unconfirmed' as const,
    };
  }

  clear(agent: AgentId, input: Record<string, unknown>) {
    if (Object.keys(input).length) throw new Error('clear_expression takes no arguments.');
    const previous = this.active.get(agent);
    if (previous) clearTimeout(previous.timer);
    this.active.delete(agent);
    this.changed(agent);
    return {
      accepted: true as const,
      status: 'cleared' as const,
      expressionId: previous?.expression.id ?? null,
      rendering: 'unconfirmed' as const,
    };
  }

  close() {
    this.active.forEach(({ timer }) => clearTimeout(timer));
    this.active.clear();
    this.lastAccepted.clear();
  }
}
