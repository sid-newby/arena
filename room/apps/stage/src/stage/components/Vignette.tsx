export function Vignette({ amount, color }: { amount: number | null; color: string | null }) {
  return (
    <div
      className="stage-node stage-vignette"
      style={{
        opacity: amount ?? 0.6,
        background: `radial-gradient(ellipse at center, transparent 45%, ${color ?? '#000'} 100%)`,
      }}
    />
  );
}
