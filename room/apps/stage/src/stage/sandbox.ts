export const sandboxAllow = ['autoplay', 'fullscreen'] as const;
export type SandboxAllow = (typeof sandboxAllow)[number];

/**
 * Inline code and https CDNs may run, nothing may phone home, nothing may
 * navigate or nest. The frame has no origin, so the parent page is unreachable.
 */
export const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  'font-src data: https:',
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const META = `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`;

/** A full document keeps its shape and gets the policy injected; a fragment is wrapped. */
export function sandboxDocument(html: string, css: string | null, js: string | null) {
  const style = css ? `<style>${css}</style>` : '';
  const script = js ? `<script>${js}</script>` : '';
  if (/^\s*<!doctype|^\s*<html/i.test(html)) {
    const withHead = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (open) => `${open}${META}${style}`)
      : html.replace(/<html[^>]*>/i, (open) => `${open}<head>${META}${style}</head>`);
    return /<\/body>/i.test(withHead)
      ? withHead.replace(/<\/body>/i, `${script}</body>`)
      : `${withHead}${script}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${META}${style}</head><body>${html}${script}</body></html>`;
}
