import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const hash = (data) => createHash('sha256').update(data).digest('hex');
function blocks(css) {
  const result = [];
  let start = 0,
    depth = 0,
    quote = '',
    comment = false;
  for (let i = 0; i < css.length; i++) {
    const c = css[i],
      next = css[i + 1];
    if (comment) {
      if (c === '*' && next === '/') {
        comment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && next === '*') {
      comment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    if ((c === '}' && --depth === 0) || (c === ';' && depth === 0)) {
      result.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  return result;
}
const library = await read('assets/vendor/basecoat-1.1.0.css.txt');
const subset = blocks(library)
  .flatMap((block) => {
    const clean = block.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (clean.startsWith('@layer components {')) {
      const components = blocks(clean.slice(clean.indexOf('{') + 1, -1)).filter((rule) =>
        /^\s*\.table(?:\b|-)/.test(rule),
      );
      return components.length ? [`@layer components {${components.join('')}\n}`] : [];
    }
    return /^@layer (?:theme|base|properties)|^@property|^@supports/.test(clean) ? [block] : [];
  })
  .join('\n');
const canonical = await read('../../apps/web/src/index.css');
const rootVariables = canonical.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
if (!rootVariables) throw new Error('Canonical Black Lacquer root not found');
const allowed =
  /^(?:font-(?:sans|display|mono)|background|foreground|card(?:-foreground)?|popover(?:-foreground)?|primary(?:-foreground)?|secondary(?:-foreground)?|muted(?:-foreground)?|accent(?:-foreground)?|destructive|border|input|ring|chart-[1-5]|radius)$/;
const tokens = [...rootVariables.matchAll(/--([\w-]+):\s*([^;]+);/g)]
  .filter((match) => allowed.test(match[1]))
  .map((match) => `--${match[1]}:${match[2]};`)
  .join('');
const adapter = `:root{color-scheme:dark;${tokens}}`;
const fonts = await Promise.all(
  [
    ['Geist Variable', 'geist.ttf', '100 900'],
    ['Barlow Condensed', 'barlow-condensed.ttf', '600'],
  ].map(
    async ([family, file, weight]) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/ttf;base64,${(await readFile(new URL('assets/vendor/' + file, root))).toString('base64')}) format('truetype')}`,
  ),
);
const css = [subset, adapter, ...fonts, await read('src/renderer/report.css')].join('\n');
const controller = await read('src/renderer/controller.js');
const receipt = JSON.parse(await read('../../docs/reporting-cdn-proof.json'));
const dependencies = receipt.dependencies.map(({ name, url, integrity }) => ({
  name,
  url,
  integrity,
}));
const provenance = {
  version: 1,
  themeSource: 'apps/web/src/index.css :root',
  themeAdapterHash: hash(adapter),
  cssHash: hash(css),
  basecoat: {
    version: '1.1.0',
    source: 'https://registry.npmjs.org/basecoat-css/-/basecoat-css-1.1.0.tgz',
    sourceCssSha256: hash(library),
    subsetSha256: hash(subset),
    components: ['table'],
    license: 'MIT',
  },
  fonts: {
    source: 'apps/web/public/fonts',
    license: 'OFL-1.1',
    files: ['geist-0.ttf', 'barlow-condensed-2.ttf'],
  },
  dependencies,
};
const assets = {
  rendererVersion: '1.0.0',
  rendererBuild: hash(
    (await read('src/render.ts')) + css + controller + JSON.stringify(dependencies),
  ),
  themeAdapterHash: hash(adapter),
  cssHash: hash(css),
  css,
  controller,
  dependencies,
};
await writeFile(
  new URL('src/render-assets.ts', root),
  `import type { ReportAssets } from './contracts.js';\nexport const reportAssets: ReportAssets = ${JSON.stringify(assets)};\n`,
);
await writeFile(
  new URL('assets/provenance.json', root),
  JSON.stringify(provenance, null, 2) + '\n',
);
execFileSync(fileURLToPath(new URL('../../node_modules/.bin/oxfmt', root)), [
  fileURLToPath(new URL('src/render-assets.ts', root)),
  fileURLToPath(new URL('assets/provenance.json', root)),
]);
process.stdout.write(
  `Compiled report assets: ${Buffer.byteLength(css)} CSS bytes, ${Buffer.byteLength(controller)} controller bytes\n`,
);
