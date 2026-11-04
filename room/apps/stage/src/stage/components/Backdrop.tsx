import { ShaderBackdrop } from './ShaderBackdrop';
import type { ShaderPreset } from '../shaders';

export function Backdrop({
  kind,
  color,
  stops,
  angle,
  shader,
}: {
  kind: 'solid' | 'gradient' | 'shader';
  color: string | null;
  stops: string[] | null;
  angle: number | null;
  shader: ShaderPreset | null;
}) {
  if (kind === 'shader') {
    const palette: [string, string, string] = [
      stops?.[0] ?? color ?? '#05070d',
      stops?.[1] ?? '#1b2a44',
      stops?.[2] ?? stops?.[1] ?? '#f2a93b',
    ];
    return (
      <div className="stage-node" style={{ inset: 0, zIndex: 0, background: palette[0] }}>
        <ShaderBackdrop preset={shader ?? 'noise'} palette={palette} />
      </div>
    );
  }
  const background =
    kind === 'gradient' && stops && stops.length > 1
      ? `linear-gradient(${angle ?? 180}deg, ${stops.join(', ')})`
      : (color ?? stops?.[0] ?? '#000');
  return <div className="stage-node" style={{ inset: 0, zIndex: 0, background }} />;
}
