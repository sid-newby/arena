export function Backdrop({
  kind,
  color,
  stops,
  angle,
}: {
  kind: 'solid' | 'gradient';
  color: string | null;
  stops: string[] | null;
  angle: number | null;
}) {
  const background =
    kind === 'gradient' && stops && stops.length > 1
      ? `linear-gradient(${angle ?? 180}deg, ${stops.join(', ')})`
      : (color ?? stops?.[0] ?? '#000');
  return <div className="stage-node" style={{ inset: 0, zIndex: 0, background }} />;
}
