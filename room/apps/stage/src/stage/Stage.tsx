import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { STAGE_HEIGHT, STAGE_WIDTH } from './transform';

export function Stage({ name, children }: { name: string | null; children?: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      setScale(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <section ref={viewport} className="stage-viewport" aria-label={name ?? 'Stage'}>
      <div className="stage-space" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </section>
  );
}
