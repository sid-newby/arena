import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const install = z.object({ scope: z.string(), installPath: z.string() });

/** Share the installed release with both seats without exposing the rest of Claude's home. */
export function hyperframesPluginRoot(): string | undefined {
  const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  try {
    const registry = JSON.parse(
      readFileSync(join(config, 'plugins/installed_plugins.json'), 'utf8'),
    );
    const cache = realpathSync(join(config, 'plugins/cache'));
    for (const [id, installs] of Object.entries(registry.plugins)) {
      const [name, marketplace] = id.split('@');
      if (name !== 'hyperframes' || !marketplace || !/^[a-z0-9][a-z0-9._-]*$/i.test(marketplace))
        continue;
      for (const record of Array.isArray(installs) ? installs : []) {
        const entry = install.safeParse(record);
        if (!entry.success || entry.data.scope !== 'user') continue;
        try {
          const root = realpathSync(entry.data.installPath);
          const prefix = join(cache, marketplace, 'hyperframes') + '/';
          if (!root.startsWith(prefix) || !/^\d[\w.+-]*$/.test(root.slice(prefix.length))) continue;
          const launcher = join(root, 'skills/hyperframes/scripts/plugin-cli.mjs');
          if (realpathSync(launcher) === launcher && statSync(launcher).isFile()) return root;
        } catch {
          // A stale marketplace entry may precede a working installation.
        }
      }
    }
  } catch {
    // HyperFrames is optional. The project shell also works without a plugin registry.
  }
}
