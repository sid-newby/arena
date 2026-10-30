import { useEffect, useRef, type RefObject } from 'react';
import {
  ActivityTimeline,
  activityMotion,
  expressionMotion,
  type ActivityFrame,
} from '@/lib/panel-motion';
import type { ActiveExpression } from '@/lib/panel-expression';
import type { AgentId } from '@/lib/agents';

export function usePanelMotion(
  target: RefObject<HTMLDivElement | null>,
  agent: AgentId,
  frame: ActivityFrame,
  expression: ActiveExpression | null,
  enabled: boolean,
) {
  const timeline = useRef(new ActivityTimeline());
  const animation = useRef<Animation | null>(null);
  const expressionId = useRef<string | null>(null);
  useEffect(() => {
    const cue = timeline.current.observe(
      frame,
      enabled,
      Boolean(expression || expressionId.current),
    );
    const element = target.current;
    if (!element) return;
    if (!enabled) {
      animation.current?.cancel();
      expressionId.current = null;
      return;
    }
    if (!frame.connected && !expression) {
      animation.current?.cancel();
      return;
    }
    if (expression) {
      if (expressionId.current === expression.id) return;
      animation.current?.cancel();
      expressionId.current = expression.id;
      const remaining = expression.deadline - performance.now();
      if (remaining <= 0) return;
      const next = element.animate(expressionMotion(expression.mood, expression.intensity, agent), {
        duration: expression.duration,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
      next.currentTime = Math.max(0, expression.duration - remaining);
      animation.current = next;
      return;
    }
    if (expressionId.current) {
      animation.current?.cancel();
      expressionId.current = null;
    }
    if (cue) {
      animation.current?.cancel();
      const motion = activityMotion(cue, agent);
      animation.current = element.animate(motion.keyframes, {
        duration: motion.duration,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
  }, [target, agent, enabled, expression, frame]);
  useEffect(
    () => () => {
      animation.current?.cancel();
      expressionId.current = null;
    },
    [],
  );
}
