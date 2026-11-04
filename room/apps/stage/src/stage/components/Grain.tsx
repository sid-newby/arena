export function Grain({ amount, speed }: { amount: number | null; speed: number | null }) {
  return (
    <div
      className="stage-node stage-grain"
      style={{
        opacity: amount ?? 0.3,
        animationDuration: `${Math.max(80, 1000 / (speed ?? 3))}ms`,
      }}
    />
  );
}
