import { nodeStyle, type Transform } from '../transform';
import { sandboxDocument, type SandboxAllow } from '../sandbox';

export function SandboxFrame({
  html,
  css,
  js,
  allow,
  transform,
}: {
  html: string;
  css: string | null;
  js: string | null;
  allow: SandboxAllow[] | null;
  transform: Transform;
}) {
  const base = nodeStyle(transform);
  return (
    <iframe
      className="stage-node stage-sandbox"
      data-enter={transform.enter ?? 'fade'}
      title="Sandboxed experiment"
      sandbox="allow-scripts"
      allow={(allow ?? []).join('; ')}
      referrerPolicy="no-referrer"
      srcDoc={sandboxDocument(html, css, js)}
      style={{
        ...base,
        width: base.width ?? 960,
        height: base.height ?? 540,
        zIndex: Math.max(90, transform.z ?? 90),
      }}
    />
  );
}
