import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../../../src/workspaces/project-directory.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';

it('initializes an empty project once and uses its commit for isolated worktrees', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lilbits-project-')));
  try {
    const project = join(root, 'project');
    const controlRoot = join(root, 'control');
    const options = { path: project, controlRoot, runId: 'run-1' };
    expect(await initializeProject(options)).toBe(project);
    expect(await initializeProject(options)).toBe(project);
    expect(readFileSync(join(project, 'README.md'), 'utf8')).toContain('TBD');
    expect(readFileSync(join(project, '.gitignore'), 'utf8')).toContain('lilbits/');
    const revision = execFileSync('git', ['-C', project, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const manager = new WorkspaceManager({ controlRoot, managedRoot: join(root, 'managed') });
    const workspaces = await manager.provision({
      runId: 'run-1',
      source: { repository: project, revision },
      projectDirectory: project,
    });
    expect(workspaces.projectDirectory).toBe(project);
    expect(workspaces.seats.a.root).not.toBe(workspaces.seats.b.root);
    expect(existsSync(join(workspaces.seats.a.root, '.git'))).toBe(true);
    expect(manager.get('run-1')?.projectDirectory).toBe(project);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('does not initialize or stage unrelated files in a nonempty folder', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lilbits-project-')));
  try {
    const project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'private.txt'), 'private');
    await expect(
      initializeProject({ path: project, controlRoot: join(root, 'control'), runId: 'run-1' }),
    ).rejects.toThrow('empty project');
    expect(existsSync(join(project, '.git'))).toBe(false);
    expect(readFileSync(join(project, 'private.txt'), 'utf8')).toBe('private');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'darwin' || process.env.ROOM_SANDBOX_TESTS !== '1')(
  'project result preservation',
  () => {
    it('preserves two independent outputs inside the project and retries without replacing them', async () => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'lilbits-project-')));
      try {
        const project = await initializeProject({
          path: join(root, 'project'),
          controlRoot: join(root, 'control'),
          runId: 'run-1',
        });
        const revision = execFileSync('git', ['-C', project, 'rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim();
        const manager = new WorkspaceManager({
          controlRoot: join(root, 'control'),
          managedRoot: join(root, 'managed'),
        });
        const workspaces = await manager.provision({
          runId: 'run-1',
          source: { repository: project, revision },
          projectDirectory: project,
          resultNames: { run: 'solve-task-run-1', a: 'a-luna', b: 'b-opus' },
        });
        writeFileSync(join(workspaces.seats.a.root, 'answer.txt'), 'seat a');
        writeFileSync(join(workspaces.seats.b.root, 'answer.txt'), 'seat b');
        manager.retain('run-1');
        const { WorkspaceLifecycle } =
          await import('../../../src/workspaces/workspace-lifecycle.js');
        const lifecycle = new WorkspaceLifecycle(manager);
        const a = await lifecycle.preserve('run-1', 'a');
        const b = await lifecycle.preserve('run-1', 'b');
        expect(a.path).toBe(join(project, 'lilbits', 'solve-task-run-1', 'a-luna'));
        expect(b.path).toBe(join(project, 'lilbits', 'solve-task-run-1', 'b-opus'));
        expect(readFileSync(join(a.path, 'answer.txt'), 'utf8')).toBe('seat a');
        expect(readFileSync(join(b.path, 'answer.txt'), 'utf8')).toBe('seat b');
        expect(await lifecycle.preserve('run-1', 'a')).toEqual(a);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);

it('recovers an initial commit completed before its initialization marker was removed', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lilbits-project-')));
  try {
    const { createHash } = await import('node:crypto');
    const project = join(root, 'project');
    const controlRoot = join(root, 'control');
    const input = { path: project, controlRoot, runId: 'run-1' };
    await initializeProject(input);
    const markers = join(controlRoot, 'project-initializations');
    const marker = join(markers, createHash('sha256').update(project).digest('hex'));
    writeFileSync(marker, JSON.stringify({ path: project, runId: 'run-1' }));
    expect(await initializeProject(input)).toBe(project);
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('adds an initial commit to an empty repository without staging user files', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lilbits-project-')));
  try {
    const project = join(root, 'project');
    mkdirSync(project);
    execFileSync('git', ['init', '--initial-branch=main', project]);
    const input = { path: project, controlRoot: join(root, 'control'), runId: 'run-1' };
    expect(await initializeProject(input)).toBe(project);
    const files = execFileSync('git', ['-C', project, 'ls-tree', '--name-only', 'HEAD'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    expect(files).toEqual(['.gitignore', 'README.md']);
    expect(await initializeProject(input)).toBe(project);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
