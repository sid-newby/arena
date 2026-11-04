import { nodeStyle, type Transform } from '../transform';

export function Shape({
  kind,
  fill,
  stroke,
  strokeWidth,
  transform,
}: {
  kind: 'rect' | 'circle' | 'line';
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  transform: Transform;
}) {
  const base = nodeStyle(transform);
  return (
    <div
      className="stage-node"
      data-enter={transform.enter ?? 'fade'}
      style={{
        ...base,
        width: base.width ?? 200,
        height: kind === 'line' ? (transform.h ?? 2) : (base.height ?? 200),
        background: fill ?? (kind === 'line' ? 'currentColor' : 'transparent'),
        border: stroke ? `${strokeWidth ?? 2}px solid ${stroke}` : undefined,
        borderRadius: kind === 'circle' ? '50%' : 0,
      }}
    />
  );
}
