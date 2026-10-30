import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const misplaced = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(?:test|spec|e2e-spec)\.[cm]?[jt]sx?$/.test(entry.name)) misplaced.push(path);
  }
}
await Promise.all(['apps/api/src', 'apps/web/src', 'scripts'].map(inspect));
if (misplaced.length) {
  throw new Error(
    `Move tests into apps/api/test/unit, apps/web/test, or test/scripts: ${misplaced.join(', ')}`,
  );
}
