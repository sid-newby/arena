import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ExpressionTimeline,
  type ActiveExpression,
  type ExpressionSnapshot,
} from '@/lib/panel-expression';

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktopQuery = window.matchMedia('(min-width: 701px)');
function subscribeMotion(change: () => void) {
  motionQuery.addEventListener('change', change);
  return () => motionQuery.removeEventListener('change', change);
}
function subscribeVisibility(change: () => void) {
  document.addEventListener('visibilitychange', change);
  return () => document.removeEventListener('visibilitychange', change);
}
function subscribeViewport(change: () => void) {
  desktopQuery.addEventListener('change', change);
  return () => desktopQuery.removeEventListener('change', change);
}

export function usePanelExpression(
  snapshot: ExpressionSnapshot,
  effectsEnabled: boolean,
  selected: boolean,
) {
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => motionQuery.matches);
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden);
  const desktop = useSyncExternalStore(subscribeViewport, () => desktopQuery.matches);
  const enabled = effectsEnabled && !reducedMotion && visible && (desktop || selected);
  const timeline = useRef(new ExpressionTimeline());
  const [active, setActive] = useState<ActiveExpression | null>(null);
  useEffect(() => {
    const now = performance.now();
    const next = timeline.current.observe(snapshot, now, enabled);
    setActive(next);
    if (!next) return;
    const timer = window.setTimeout(
      () => {
        setActive(timeline.current.at(performance.now()));
      },
      Math.max(0, Math.ceil(next.deadline - now)) + 1,
    );
    return () => window.clearTimeout(timer);
  }, [snapshot, enabled]);
  return { expression: enabled ? active : null, enabled, motionEnabled: enabled && desktop };
}
