import type { CSSProperties } from 'react';

const styles: Record<'subtitle' | 'speech' | 'label', CSSProperties> = {
  subtitle: { fontSize: 36, fontWeight: 500, textShadow: '0 2px 12px rgba(0,0,0,0.8)' },
  speech: {
    fontSize: 32,
    fontStyle: 'italic',
    background: 'rgba(0,0,0,0.55)',
    padding: '12px 28px',
    borderRadius: 12,
  },
  label: { fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 },
};

export function Caption({
  text,
  style,
  anchor,
}: {
  text: string;
  style: 'subtitle' | 'speech' | 'label' | null;
  anchor: 'top' | 'bottom' | null;
}) {
  return (
    <div
      className="stage-node"
      data-enter="fade"
      style={{
        left: 0,
        right: 0,
        [anchor === 'top' ? 'top' : 'bottom']: 72,
        zIndex: 90,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <span style={styles[style ?? 'subtitle']}>{text}</span>
    </div>
  );
}
