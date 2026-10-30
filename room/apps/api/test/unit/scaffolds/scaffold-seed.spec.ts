import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareScaffoldSeed, templateDigest } from '../../../src/scaffolds/scaffold-seed.js';
import { parseTask } from '../../../src/debate/workflow.store.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'maestro-scaffold-'));
  roots.push(root);
  const catalog = join(root, 'catalog'),
    template = join(catalog, 'starter', 'template');
  mkdirSync(template, { recursive: true });
  writeFileSync(
    join(catalog, 'starter', 'source.json'),
    JSON.stringify({
      id: 'starter',
      importedOn: '2026-10-30',
      sourceRepository: 'https://github.com/example/starter',
      sourceCommit: 'a'.repeat(40),
    }),
  );
  writeFileSync(join(template, 'Taskfile.yml'), 'version: 3\n');
  return { root, catalog, template };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
describe('scaffold seeds', () => {
  it('rejects links and preserves scaffold selection in task parsing', () => {
    const { template } = fixture();
    symlinkSync('/etc/passwd', join(template, 'escape'));
    expect(() => templateDigest(template)).toThrow('regular files');
    const task = {
      question: 'Build an example',
      mode: 'prototype',
      expectedArtifact: '',
      criteria: [],
      grounding: [],
      source: null,
      profile: 'build',
      maxHandoffs: 0,
      timeLimitSeconds: 30,
      scaffold: { id: 'starter' },
    };
    expect(parseTask(task).scaffold).toEqual({ id: 'starter' });
    expect(() =>
      parseTask({ ...task, source: { repository: '/tmp/example', revision: 'HEAD' } }),
    ).toThrow('either a scaffold or a repository');
  });
  it.skipIf(process.platform !== 'darwin' || !process.env.ROOM_SANDBOX_TESTS)(
    'pins the template, makes a clean Git seed, and recovers by reusing it',
    async () => {
      const { root, catalog, template } = fixture();
      writeFileSync(join(template, '.gitignore'), 'ignored.txt\n');
      writeFileSync(join(template, 'ignored.txt'), 'included');
      const digest = templateDigest(template);
      const first = await prepareScaffoldSeed(
        join(root, 'control'),
        { id: 'starter', digest },
        catalog,
      );
      expect(readFileSync(join(first.repository, 'ignored.txt'), 'utf8')).toBe('included');
      expect(
        execFileSync('git', ['-C', first.repository, 'show', 'HEAD:ignored.txt'], {
          encoding: 'utf8',
        }),
      ).toBe('included');
      expect(first.revision).toMatch(/^[a-f0-9]{40}$/);
      expect(readFileSync(join(first.repository, 'Taskfile.yml'), 'utf8')).toContain('version');
      expect(
        await prepareScaffoldSeed(join(root, 'control'), { id: 'starter', digest }, catalog),
      ).toEqual(first);
      writeFileSync(join(template, 'changed.txt'), 'changed');
      await expect(
        prepareScaffoldSeed(join(root, 'control'), { id: 'starter', digest }, catalog),
      ).rejects.toThrow('changed');
    },
  );
  it.skipIf(process.platform !== 'darwin' || !process.env.ROOM_SANDBOX_TESTS)(
    'materializes the bundled template as an actual clean seed',
    async () => {
      const { root } = fixture();
      const seed = await prepareScaffoldSeed(join(root, 'bundled-control'), { id: 'react-nest' });
      expect(readFileSync(join(seed.repository, 'Taskfile.yml'), 'utf8')).toContain('install:');
      expect(
        execFileSync('git', ['-C', seed.repository, 'status', '--porcelain'], { encoding: 'utf8' }),
      ).toBe('');
      expect(
        execFileSync('git', ['-C', seed.repository, 'show', 'HEAD:pnpm-workspace.yaml'], {
          encoding: 'utf8',
        }),
      ).toContain('minimumReleaseAge');
    },
  );
});
