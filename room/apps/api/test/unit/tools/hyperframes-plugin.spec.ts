import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { hyperframesPluginRoot } from '../../../src/tools/hyperframes-plugin.js';

it('shares only a registered user release with a launcher inside its own directory', () => {
  const config = mkdtempSync(join(tmpdir(), 'arena-plugin-'));
  vi.stubEnv('CLAUDE_CONFIG_DIR', config);
  try {
    expect(hyperframesPluginRoot()).toBeUndefined();
    const root = join(config, 'plugins/cache/market/hyperframes/1.2.3');
    const scripts = join(root, 'skills/hyperframes/scripts');
    mkdirSync(scripts, { recursive: true });
    const registry = join(config, 'plugins/installed_plugins.json');
    const register = (installPath: string, scope: string) =>
      writeFileSync(
        registry,
        JSON.stringify({ plugins: { 'hyperframes@market': [{ scope, installPath }] } }),
      );
    const launcher = join(scripts, 'plugin-cli.mjs');
    register(root, 'user');
    symlinkSync(registry, launcher);
    expect(hyperframesPluginRoot()).toBeUndefined();
    rmSync(launcher);
    writeFileSync(launcher, '');
    register(root, 'project');
    expect(hyperframesPluginRoot()).toBeUndefined();
    register(config, 'user');
    expect(hyperframesPluginRoot()).toBeUndefined();
    register(root, 'user');
    expect(hyperframesPluginRoot()).toBe(realpathSync(root));
  } finally {
    rmSync(config, { recursive: true, force: true });
  }
});

afterEach(() => vi.unstubAllEnvs());
