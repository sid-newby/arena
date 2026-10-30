import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';
import { WorkspaceLifecycle } from '../../../src/workspaces/workspace-lifecycle.js';

const git = (cwd: string, args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-C', cwd, ...args],
    { encoding: 'utf8' },
  ).trim();

describe.skipIf(process.platform !== 'darwin' || process.env.ROOM_SANDBOX_TESTS !== '1')(
  'workspace lifecycle',
  () => {
    it('preserves actual dirty content with fresh history, refuses changed results, and safely removes only the original', async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'room-lifecycle-')));
      try {
        const manager = new WorkspaceManager({
          controlRoot: join(root, 'control'),
          managedRoot: join(root, 'managed'),
        });
        const workspaces = await manager.provision({ runId: 'one' });
        writeFileSync(join(workspaces.seats.a.root, 'prototype.txt'), 'prototype');
        const lifecycle = new WorkspaceLifecycle(manager);
        await expect(lifecycle.preserve('one', 'a')).rejects.toThrow('Complete or stop');
        manager.retain('one');
        const result = await lifecycle.preserve('one', 'a');
        expect(readFileSync(join(result.path, 'prototype.txt'), 'utf8')).toBe('prototype');
        expect(existsSync(join(result.path, '.git'))).toBe(true);
        expect(await lifecycle.preserve('one', 'a')).toEqual(result);
        const commit = readFileSync(
          join(manager.controlRoot, 'results', 'one', 'a.json.commit'),
          'utf8',
        );
        const calls: string[][] = [];
        const publisher = new WorkspaceLifecycle(manager, async (binary, args) => {
          calls.push([binary, ...args]);
          if (binary === 'git' && args[0] === 'rev-parse') return commit;
          if (binary === 'git') return '';
          if (args[0] === 'api' && args[1] === 'user') return 'tester';
          if (args[1] === 'repos/tester/prototype' && args.length === 2)
            throw new Error('Not found');
          if (args[1] === 'user/repos')
            return JSON.stringify({
              private: true,
              description: args
                .find((arg) => arg.startsWith('description='))
                ?.slice('description='.length),
              html_url: 'https://github.com/tester/prototype',
            });
          if (args[1]?.endsWith('/branches')) return '[]';
          if (args[1]?.endsWith('/git/ref/heads/main')) return commit;
          if (args.at(-1) === '.private') return 'true';
          throw new Error('Unexpected publish call');
        });
        const published = await publisher.publishPrivate({
          runId: 'one',
          seat: 'a',
          digest: result.digest,
          name: 'prototype',
        });
        expect(published.remote).toBe('https://github.com/tester/prototype');
        expect(calls.some((call) => call.includes('private=true'))).toBe(true);
        expect(calls.some((call) => call.includes(`${commit}:refs/heads/main`))).toBe(true);
        const metadata = join(manager.controlRoot, 'results', 'one', 'a.json');
        writeFileSync(`${metadata}.pending`, `${result.path}.staging`);
        writeFileSync(`${metadata}.pending.result`, JSON.stringify(result));
        expect(await lifecycle.preserve('one', 'a')).toEqual(published);
        await expect(lifecycle.cleanup({ runId: 'one', seat: 'a', digest: 'bad' })).rejects.toThrow(
          'Review',
        );
        writeFileSync(join(workspaces.seats.a.root, '.env.new'), 'PRIVATE=value');
        await expect(
          lifecycle.cleanup({ runId: 'one', seat: 'a', digest: result.digest }),
        ).rejects.toThrow('private files');
        rmSync(join(workspaces.seats.a.root, '.env.new'));
        writeFileSync(join(workspaces.seats.a.root, 'prototype.txt'), 'new work');
        await expect(
          lifecycle.cleanup({ runId: 'one', seat: 'a', digest: result.digest }),
        ).rejects.toThrow('changed after');
        const revised = await lifecycle.preserve('one', 'a');
        expect(revised.path).not.toBe(result.path);
        expect(revised.digest).not.toBe(result.digest);
        expect(readFileSync(join(result.path, 'prototype.txt'), 'utf8')).toBe('prototype');
        expect(readFileSync(join(revised.path, 'prototype.txt'), 'utf8')).toBe('new work');
        expect(JSON.parse(readFileSync(`${metadata}.snapshot`, 'utf8'))).toEqual(published);
        writeFileSync(metadata, JSON.stringify(published));
        writeFileSync(`${metadata}.pending`, `${revised.path}.staging`);
        writeFileSync(`${metadata}.pending.result`, JSON.stringify(revised));
        expect(await lifecycle.preserve('one', 'a')).toEqual(revised);
        expect(await lifecycle.preserve('one', 'a')).toEqual(revised);
        await expect(
          lifecycle.cleanup({ runId: 'one', seat: 'a', digest: result.digest }),
        ).rejects.toThrow('Review');
        const cleaned = await lifecycle.cleanup({
          runId: 'one',
          seat: 'a',
          digest: revised.digest,
        });
        expect(cleaned.cleanedAt).toEqual(expect.any(Number));
        expect(existsSync(workspaces.seats.a.root)).toBe(false);
        expect(existsSync(workspaces.seats.b.root)).toBe(true);
        expect(readFileSync(join(result.path, 'prototype.txt'), 'utf8')).toBe('prototype');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
    it('reports excluded secrets, refuses cleanup that would lose them, and rejects symlinks', async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'room-lifecycle-links-')));
      try {
        const manager = new WorkspaceManager({ controlRoot: join(root, 'control') });
        const workspaces = await manager.provision({ runId: 'two' });
        writeFileSync(join(workspaces.seats.a.root, '.env.local'), 'SECRET=private');
        manager.retain('two');
        const lifecycle = new WorkspaceLifecycle(manager);
        const result = await lifecycle.preserve('two', 'a');
        expect(result.excluded).toContain('.env.local');
        expect(existsSync(join(result.path, '.env.local'))).toBe(false);
        await expect(
          lifecycle.cleanup({ runId: 'two', seat: 'a', digest: result.digest }),
        ).rejects.toThrow('private files');
        symlinkSync('/etc/passwd', join(workspaces.seats.b.root, 'escape'));
        await expect(lifecycle.preserve('two', 'b')).rejects.toThrow('Symbolic links');
        expect(existsSync(join(manager.managedRoot, 'results', 'two', 'b'))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
it('preserves Git history before removing the owned worktree and leaves the source untouched', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'room-lifecycle-git-')));
  try {
    const { mkdirSync } = await import('node:fs');
    const source = join(root, 'source');
    mkdirSync(source);
    git(source, ['init', '--initial-branch=main']);
    writeFileSync(join(source, 'source.txt'), 'original');
    git(source, ['add', '.']);
    git(source, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@localhost',
      'commit',
      '-m',
      'source',
    ]);
    const original = git(source, ['rev-parse', 'HEAD']);
    const manager = new WorkspaceManager({
      controlRoot: join(root, 'control'),
      managedRoot: join(root, 'managed'),
    });
    const run = await manager.provision({
      runId: 'git-run',
      source: { repository: source, revision: original },
    });
    writeFileSync(join(run.seats.a.root, 'prototype.txt'), 'dirty prototype');
    manager.retain('git-run');
    const lifecycle = new WorkspaceLifecycle(manager);
    const result = await lifecycle.preserve('git-run', 'a');
    await lifecycle.cleanup({ runId: 'git-run', seat: 'a', digest: result.digest });
    expect(existsSync(run.seats.a.root)).toBe(false);
    expect(existsSync(join(manager.controlRoot, 'results', 'git-run', 'a-history.bundle'))).toBe(
      true,
    );
    expect(git(source, ['rev-parse', 'HEAD'])).toBe(original);
    expect(readFileSync(join(source, 'source.txt'), 'utf8')).toBe('original');
    expect(git(result.path, ['rev-list', '--count', 'HEAD'])).toBe('1');
    expect(readFileSync(join(result.path, 'prototype.txt'), 'utf8')).toBe('dirty prototype');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
