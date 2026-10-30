import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'room-workspaces-'));
  roots.push(root);
  return { root, manager: new WorkspaceManager({ controlRoot: join(root, 'control') }) };
}
function git(repository: string, args: string[]) {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('provisions separate scratch workspaces idempotently and retains their contents across a new manager', async () => {
  const { root, manager } = fixture();
  const run = await manager.provision({ runId: 'run-one' });
  writeFileSync(join(run.seats.a.root, 'draft.txt'), 'A');
  writeFileSync(join(run.seats.b.root, 'draft.txt'), 'B');
  expect(await manager.provision({ runId: 'run-one' })).toEqual(run);
  manager.retain('run-one');
  const reopened = new WorkspaceManager({ controlRoot: join(root, 'control') });
  expect(reopened.get('run-one')?.state).toBe('retained');
  expect(readFileSync(join(reopened.workspace('run-one', 'a').root, 'draft.txt'), 'utf8')).toBe(
    'A',
  );
  expect(readFileSync(join(reopened.workspace('run-one', 'b').root, 'draft.txt'), 'utf8')).toBe(
    'B',
  );
});
it('places new workspaces in a separate managed root while retaining legacy runs', async () => {
  const { root, manager } = fixture();
  const legacy = await manager.provision({ runId: 'legacy' });
  const managedRoot = join(root, 'visible');
  const relocated = new WorkspaceManager({ controlRoot: join(root, 'control'), managedRoot });
  expect(relocated.workspace('legacy', 'a').root).toBe(legacy.seats.a.root);
  const next = await relocated.provision({ runId: 'new' });
  expect(next.seats.a.root).toBe(join(relocated.managedRoot, 'new', 'a'));
  expect(next.seats.b.root).toBe(join(relocated.managedRoot, 'new', 'b'));
  expect(relocated.get('new')).toEqual(next);
});
it('rejects a managed root that overlaps private control state', () => {
  const { root } = fixture();
  expect(
    () =>
      new WorkspaceManager({
        controlRoot: join(root, 'control'),
        managedRoot: join(root, 'control', 'visible'),
      }),
  ).toThrow('separate from private control');
});
it('does not adopt an existing scratch directory or change its contents', async () => {
  const { root, manager } = fixture();
  const path = join(root, 'control', 'workspaces', 'collision', 'a');
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'owner.txt'), 'do not change');
  await expect(manager.provision({ runId: 'collision' })).rejects.toThrow(
    'ownership cannot be verified',
  );
  expect(readFileSync(join(path, 'owner.txt'), 'utf8')).toBe('do not change');
  expect(existsSync(join(path, '.tool-home'))).toBe(false);
});
it('creates distinct worktree branches at the reviewed commit and leaves the source unchanged', async () => {
  const { root, manager } = fixture();
  const repository = join(root, 'source');
  mkdirSync(repository);
  git(repository, ['init', '-q']);
  writeFileSync(join(repository, 'draft.txt'), 'source');
  git(repository, ['add', '.']);
  git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'baseline',
  ]);
  const revision = git(repository, ['rev-parse', 'HEAD']);
  const run = await manager.provision({ runId: 'git-run', source: { repository, revision } });
  writeFileSync(join(run.seats.a.root, 'draft.txt'), 'A candidate');
  writeFileSync(join(run.seats.b.root, 'draft.txt'), 'B candidate');
  expect(git(run.seats.a.root, ['branch', '--show-current'])).toBe('room/git-run/a');
  expect(git(run.seats.b.root, ['branch', '--show-current'])).toBe('room/git-run/b');
  expect(readFileSync(join(repository, 'draft.txt'), 'utf8')).toBe('source');
  expect(
    (await manager.provision({ runId: 'git-run', source: { repository, revision } })).state,
  ).toBe('ready');
  git(run.seats.a.root, ['checkout', '-qb', 'foreign-branch']);
  await expect(
    manager.provision({ runId: 'git-run', source: { repository, revision } }),
  ).rejects.toThrow('Git ownership cannot be verified');
  await expect(manager.provision({ runId: 'git-run' })).rejects.toThrow(
    'different workspace source',
  );
});
it('provisions worktrees under a managed directory inside the source repository', async () => {
  const { root } = fixture();
  const repository = join(root, 'source');
  mkdirSync(repository);
  git(repository, ['init', '-q']);
  writeFileSync(join(repository, '.gitignore'), 'workspaces/\n');
  writeFileSync(join(repository, 'file.txt'), 'source');
  git(repository, ['add', '.']);
  git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'base',
  ]);
  const revision = git(repository, ['rev-parse', 'HEAD']);
  const manager = new WorkspaceManager({
    controlRoot: join(root, 'control'),
    managedRoot: join(repository, 'workspaces'),
  });
  const run = await manager.provision({ runId: 'nested', source: { repository, revision } });
  expect(git(run.seats.a.root, ['rev-parse', 'HEAD'])).toBe(revision);
  expect(git(run.seats.b.root, ['rev-parse', 'HEAD'])).toBe(revision);
  expect(git(repository, ['status', '--porcelain'])).toBe('');
});
it('rejects checkout filters before any repository command can execute them', async () => {
  const { root, manager } = fixture();
  const repository = join(root, 'filtered-source');
  mkdirSync(repository);
  git(repository, ['init', '-q']);
  writeFileSync(join(repository, 'file.txt'), 'source');
  writeFileSync(join(repository, '.gitattributes'), '*.txt filter=fixture');
  git(repository, ['add', '.']);
  git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'baseline',
  ]);
  const marker = join(root, 'filter-executed');
  git(repository, ['config', 'filter.fixture.smudge', 'touch "' + marker + '"; cat']);
  const revision = git(repository, ['rev-parse', 'HEAD']);
  await expect(
    manager.provision({ runId: 'filtered-run', source: { repository, revision } }),
  ).rejects.toThrow('checkout filters');
  expect(existsSync(marker)).toBe(false);
});
it('retries interrupted provisioning without overwriting an existing seat', async () => {
  const { root, manager } = fixture();
  const blocked = join(root, 'control', 'workspaces', 'retry-run', 'b');
  mkdirSync(join(root, 'control', 'workspaces', 'retry-run'), { recursive: true });
  writeFileSync(blocked, 'blocking fixture');
  await expect(manager.provision({ runId: 'retry-run' })).rejects.toThrow(
    /EEXIST|directory|Workspace/,
  );
  const failed = manager.get('retry-run');
  expect(failed?.state).toBe('interrupted');
  if (!failed) throw new Error('Expected retained provisioning state.');
  writeFileSync(join(failed.seats.a.root, 'kept.txt'), 'kept');
  unlinkSync(blocked);
  expect((await manager.provision({ runId: 'retry-run' })).state).toBe('ready');
  expect(readFileSync(join(failed.seats.a.root, 'kept.txt'), 'utf8')).toBe('kept');
});
it('retains immutable artifact bytes and enforces the independent-phase peer embargo', async () => {
  const { manager } = fixture();
  const run = await manager.provision({ runId: 'artifact-run' });
  const artifact = manager.publish({
    workspace: run.seats.a,
    turnId: 'turn-a',
    path: 'result.txt',
    content: Buffer.from('first result'),
  });
  writeFileSync(join(run.seats.a.root, 'result.txt'), 'different draft');
  expect(() =>
    manager.artifact({
      runId: run.runId,
      artifactId: artifact.id,
      viewer: 'b',
      allowPeerArtifacts: false,
    }),
  ).toThrow('independent work');
  expect(
    manager
      .artifact({
        runId: run.runId,
        artifactId: artifact.id,
        viewer: 'maestro',
        allowPeerArtifacts: false,
      })
      .content.toString(),
  ).toBe('first result');
  expect(
    manager
      .artifact({
        runId: run.runId,
        artifactId: artifact.id,
        viewer: 'b',
        allowPeerArtifacts: true,
      })
      .content.toString(),
  ).toBe('first result');
});
