import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectPreflight } from '../../../src/preflight/preflight.controller.js';
import type { ProviderCatalog, TaskDraft } from '../../../src/runs/run.contract.js';

const dirs: string[] = [];
function temp() {
  const root = mkdtempSync(join(tmpdir(), 'room-preflight-'));
  dirs.push(root);
  return root;
}
afterEach(() => {
  for (const root of dirs.splice(0)) rmSync(root, { recursive: true, force: true });
});
const task: TaskDraft = {
  question: 'Compare options',
  mode: 'reasoning',
  profile: 'analysis',
  expectedArtifact: '',
  criteria: [],
  grounding: [],
  source: null,
  maxHandoffs: 0,
  timeLimitSeconds: 30,
};
const seats = {
  a: { provider: 'codex', model: 'test', effort: 'high' },
  b: { provider: 'codex', model: 'test', effort: 'high' },
} satisfies Parameters<typeof inspectPreflight>[0]['seats'];
const catalog = async (): Promise<ProviderCatalog> => ({
  provider: 'codex',
  status: 'ready',
  models: [{ id: 'test', name: 'Test', efforts: ['high'] }],
});

describe('run preflight', () => {
  it('resolves an actual source commit without creating destination directories', async () => {
    const root = temp();
    const source = join(root, 'source');
    mkdirSync(source);
    execFileSync('git', ['init', '-q', source]);
    writeFileSync(join(source, 'file'), 'content');
    execFileSync('git', ['-C', source, 'add', 'file']);
    execFileSync('git', [
      '-C',
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'initial',
    ]);
    const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const result = await inspectPreflight({
      task: { ...task, source: { repository: source, revision: 'HEAD' } },
      seats,
      managedRoot: join(root, 'new', 'workspaces'),
      controlRoot: join(root, 'control'),
      catalog,
    });
    expect(result.source).toMatchObject({ ok: true, revision });
    expect(result.seats.a.ok).toBe(true);
    expect(result.destination.ok).toBe(true);
    expect(existsSync(join(root, 'new'))).toBe(false);
  });
  it('reports inaccessible sources, unavailable models and overlapping destinations', async () => {
    const root = temp();
    const result = await inspectPreflight({
      task: { ...task, source: { repository: join(root, 'missing'), revision: 'HEAD' } },
      seats,
      managedRoot: join(root, 'private', 'workspaces'),
      controlRoot: join(root, 'private'),
      catalog: async () => ({
        provider: 'codex',
        status: 'unavailable',
        reason: 'Sign in first.',
        models: [],
      }),
    });
    expect(result.source.ok).toBe(false);
    expect(result.seats.a).toEqual({ ok: false, detail: 'Sign in first.' });
    expect(result.destination.ok).toBe(false);
  });
  it('reports a destination that aliases private control state through a symlink', async () => {
    const root = temp();
    const control = join(root, 'private');
    mkdirSync(control);
    const alias = join(root, 'alias');
    symlinkSync(control, alias, 'dir');
    const result = await inspectPreflight({
      task,
      seats,
      managedRoot: join(alias, 'workspaces'),
      controlRoot: control,
      catalog,
    });
    expect(result.destination.ok).toBe(false);
  });
});

it('checks a project destination without creating it and explains non-Git content', async () => {
  const root = realpathSync(temp());
  const project = join(root, 'project');
  const input = {
    task: { ...task, projectDirectory: project },
    seats,
    managedRoot: join(root, 'managed'),
    controlRoot: join(root, 'control'),
    catalog,
  };
  expect((await inspectPreflight(input)).destination.ok).toBe(true);
  expect(existsSync(project)).toBe(false);
  mkdirSync(project);
  writeFileSync(join(project, 'private.txt'), 'private');
  expect((await inspectPreflight(input)).destination).toMatchObject({
    ok: false,
    detail: expect.stringContaining('empty project'),
  });
});

it('allows an empty source folder with HEAD without creating it', async () => {
  const root = realpathSync(temp());
  const source = join(root, 'new-source');
  const input = {
    task: { ...task, source: { repository: source, revision: 'HEAD' } },
    seats,
    managedRoot: join(root, 'managed'),
    controlRoot: join(root, 'control'),
    catalog,
  };
  expect((await inspectPreflight(input)).source).toMatchObject({
    ok: true,
    detail: expect.stringContaining('initial Git commit'),
  });
  expect(existsSync(source)).toBe(false);
  mkdirSync(source);
  writeFileSync(join(source, 'private.txt'), 'private');
  expect((await inspectPreflight(input)).source.ok).toBe(false);
});

it('treats a new folder inside another repository as a new project', async () => {
  const root = realpathSync(temp());
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'initial',
  ]);
  const source = join(root, 'new-project');
  mkdirSync(source);
  const result = await inspectPreflight({
    task: { ...task, source: { repository: source, revision: 'HEAD' } },
    seats,
    managedRoot: join(root, 'managed'),
    controlRoot: join(root, 'control'),
    catalog,
  });
  expect(result.source).toMatchObject({
    ok: true,
    detail: expect.stringContaining('initial Git commit'),
  });
  expect(existsSync(join(source, '.git'))).toBe(false);
});
