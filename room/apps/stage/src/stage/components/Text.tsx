import type { CSSProperties } from 'react';
import { nodeStyle, type Transform } from '../transform';
import type { textVariants } from '../catalog';

const scale: Record<(typeof textVariants)[number], CSSProperties> = {
  display: { fontSize: 128, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 0.95 },
  title: { fontSize: 64, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 },
  body: { fontSize: 28, fontWeight: 400, lineHeight: 1.4 },
  caption: { fontSize: 20, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' },
  mono: { fontSize: 24, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
};

export function Text({
  text,
  variant,
  align,
  color,
  maxWidth,
  transform,
}: {
  text: string;
  variant: (typeof textVariants)[number];
  align: 'left' | 'center' | 'right' | null;
  color: string | null;
  maxWidth: number | null;
  transform: Transform;
}) {
  return (
    <div
      className="stage-node"
      data-enter={transform.enter ?? 'fade'}
      style={{
        ...nodeStyle(transform),
        ...scale[variant],
        textAlign: align ?? 'left',
        color: color ?? 'inherit',
        maxWidth: maxWidth ?? undefined,
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </div>
  );
}
