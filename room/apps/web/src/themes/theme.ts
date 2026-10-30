import presets from './tweakcn-presets.json';

export type ThemeState = {
  preset: string;
  display: string;
  body: string;
  custom: Record<string, string>;
};
export const defaultTheme: ThemeState = { preset: 'lacquer', display: '', body: '', custom: {} };
export const themePresets = presets;
const key = 'lilbits-theme-v1';
const allowed =
  /^(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|chart-[1-5]|sidebar)(-foreground|-primary|-primary-foreground|-accent|-accent-foreground|-border|-ring)?$|^font-(sans|serif|mono)$|^shadow(-[a-z0-9]+)?$|^tracking-normal$|^letter-spacing$/;

export function validTokens(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a theme token object.');
  const tokens: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    const token = name.replace(/^--/, '');
    if (!allowed.test(token) || typeof raw !== 'string' || /[{};<>]|url\s*\(|@/i.test(raw))
      continue;
    const property = token.startsWith('font-')
      ? 'font-family'
      : token.startsWith('shadow')
        ? 'box-shadow'
        : token.includes('spacing') || token.startsWith('tracking')
          ? 'letter-spacing'
          : 'color';
    if (CSS.supports(property, raw)) tokens[token] = raw;
  }
  return tokens;
}

export function parseTheme(source: string): Record<string, string> {
  if (source.length > 100_000)
    throw new Error('Theme is too large. Paste only the exported CSS or registry JSON.');
  let tokens: Record<string, string>;
  if (source.trim().startsWith('{')) {
    const data = JSON.parse(source);
    if (!data.cssVars?.dark) throw new Error('Registry JSON must include cssVars.dark.');
    tokens = validTokens({ ...data.cssVars.theme, ...data.cssVars.dark });
  } else {
    const block = source.match(/\.dark\s*\{([^}]+)\}/)?.[1];
    if (!block) throw new Error('Paste the full tweakcn CSS export, including its .dark block.');
    tokens = validTokens(
      Object.fromEntries(
        [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
      ),
    );
  }
  if (!tokens.primary || !tokens.background || !tokens.foreground)
    throw new Error('Theme needs background, foreground, and primary colors.');
  return tokens;
}

export function readTheme(): ThemeState {
  try {
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!state || !['lacquer', 'custom', ...presets.map((p) => p.id)].includes(state.preset))
      return defaultTheme;
    return {
      preset: state.preset,
      display: typeof state.display === 'string' ? state.display : '',
      body: typeof state.body === 'string' ? state.body : '',
      custom: validTokens(state.custom ?? {}),
    };
  } catch {
    return defaultTheme;
  }
}

let applied: string[] = [];
export function applyTheme(state: ThemeState) {
  const root = document.documentElement;
  for (const property of applied) root.style.removeProperty(property);
  const raw =
    state.preset === 'custom'
      ? state.custom
      : (presets.find((p) => p.id === state.preset)?.tokens ?? {});
  const tokens = validTokens(raw);
  const properties: Record<string, string> = Object.fromEntries(
    Object.entries(tokens).map(([name, value]) => [`--${name}`, value]),
  );
  if (state.preset !== 'lacquer' && tokens['font-sans'])
    properties['--font-display'] = tokens['font-sans'];
  if (state.display && CSS.supports('font-family', state.display))
    properties['--font-display'] = `"${state.display.replaceAll('"', '')}", sans-serif`;
  if (state.body && CSS.supports('font-family', state.body))
    properties['--font-sans'] = `"${state.body.replaceAll('"', '')}", sans-serif`;
  properties['--radius'] = '0px';
  for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
  applied = Object.keys(properties);
  root.dataset.theme = state.preset;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* Theme remains usable when storage is disabled. */
  }
}
