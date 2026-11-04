export function Fog({
  amount,
  color,
  speed,
}: {
  amount: number | null;
  color: string | null;
  speed: number | null;
}) {
  const fog = `color-mix(in srgb, ${color ?? '#8fa3c7'} ${Math.round((amount ?? 0.35) * 100)}%, transparent)`;
  return (
    <div
      className="stage-node stage-fog"
      style={{
        background: `radial-gradient(ellipse 40% 30% at 30% 60%, ${fog}, transparent 70%), radial-gradient(ellipse 50% 35% at 70% 40%, ${fog}, transparent 70%)`,
        animationDuration: `${Math.max(4, 24 / (speed ?? 1))}s`,
      }}
    />
  );
}
