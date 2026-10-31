import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TaskDraft } from '../../../src/runs/run.contract.js';
import {
  evidencePathExamples,
  resolveLockerEvidence,
} from '../../../src/workspaces/locker-evidence.js';

let room: string;
let folder: string;
let report: string;
const draft = (question: string): TaskDraft => ({
  question,
  mode: 'reasoning',
  profile: 'analysis',
  source: null,
  grounding: [],
  expectedArtifact: 'A report.',
  criteria: [],
  maxHandoffs: 0,
  timeLimitSeconds: 60,
});
beforeEach(() => {
  room = realpathSync(mkdtempSync(join(tmpdir(), 'locker-paths-')));
  folder = join(room, 'evidence', 'project');
  report = join(folder, 'dead-opus', 'issues-final.md');
  mkdirSync(join(folder, 'dead-opus'), { recursive: true });
  writeFileSync(report, 'A report.');
});
afterEach(() => rmSync(room, { recursive: true, force: true }));

it.each([
  (path: string, project: string) => `Review these.\n${path}\n${project}`,
  (path: string) => `Review \`${path}\` carefully.`,
  (path: string) => `Review ${path}, please.`,
  (path: string) => `Review "${path}" carefully.`,
  (_path: string, project: string) => `Review ${project}.`,
])('selects only the direct locker project from an explicit reference', (question) => {
  expect(resolveLockerEvidence(room, draft(question(report, folder))).evidenceFolder).toBe(folder);
});

it('supports spaces in standalone and quoted file paths', () => {
  const project = join(room, 'evidence', 'project with spaces');
  mkdirSync(project);
  const path = join(project, 'report with spaces.md');
  writeFileSync(path, 'A report.');
  for (const question of [`Use this.\n${path}`, `Use \`${path}\` please.`, `Use "${path}" please.`])
    expect(resolveLockerEvidence(room, draft(question)).evidenceFolder).toBe(project);
});

it('ignores host paths, prefix collisions, grounding, and explicit project sources', () => {
  const question = `Review /etc/hosts and ${room}/evidence-other/project.`;
  const task = { ...draft(question), grounding: [report] };
  expect(resolveLockerEvidence(room, task)).toBe(task);
  const sourced = { ...draft(report), source: { repository: '/other/project', revision: 'HEAD' } };
  expect(resolveLockerEvidence(room, sourced)).toBe(sourced);
  const destination = { ...draft(report), projectDirectory: '/other/project' };
  expect(resolveLockerEvidence(room, destination)).toBe(destination);
  const build = { ...draft(report), profile: 'build' as const };
  expect(resolveLockerEvidence(room, build)).toBe(build);
});

it('rejects missing, ambiguous, root-only and direct locker files', () => {
  expect(() => resolveLockerEvidence(room, draft(join(folder, 'missing.md')))).toThrow('missing');
  const other = join(room, 'evidence', 'other');
  mkdirSync(other);
  expect(() => resolveLockerEvidence(room, draft(`${report}\n${other}`))).toThrow(
    'multiple locker projects',
  );
  expect(() => resolveLockerEvidence(room, draft(join(room, 'evidence')))).toThrow(
    'single project',
  );
  const loose = join(room, 'evidence', 'loose.md');
  writeFileSync(loose, 'Do not capture siblings.');
  expect(() => resolveLockerEvidence(room, draft(loose))).toThrow('project folder');
});

it('rejects symlinks at project and intermediate directories, including targets inside the locker', () => {
  const outside = join(room, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret.md'), 'Private.');
  symlinkSync(outside, join(folder, 'escape'));
  symlinkSync(folder, join(room, 'evidence', 'alias'));
  for (const path of [
    join(folder, 'escape', 'secret.md'),
    join(room, 'evidence', 'alias', 'dead-opus', 'issues-final.md'),
  ])
    expect(() => resolveLockerEvidence(room, draft(path))).toThrow('symlinks');
  expect(() =>
    resolveLockerEvidence(room, draft(join(folder, '..', '..', 'outside', 'secret.md'))),
  ).not.toThrow();
  expect(() => resolveLockerEvidence(room, draft(`${folder}/../../outside/secret.md`))).toThrow(
    'parent traversal',
  );
});

it('honors explicit selection and reports conflicting or invalid locker references', () => {
  const selected = { ...draft(report), evidenceFolder: join(folder, 'dead-opus') };
  expect(resolveLockerEvidence(room, selected)).toBe(selected);
  const other = join(room, 'evidence', 'other');
  mkdirSync(other);
  expect(() => resolveLockerEvidence(room, { ...selected, evidenceFolder: other })).toThrow(
    'outside the selected',
  );
  expect(() =>
    resolveLockerEvidence(room, { ...selected, question: join(folder, 'missing.md') }),
  ).toThrow('missing');
});

it('gives seats concrete relative filenames only for in-scope references', () => {
  const examples = evidencePathExamples(
    folder,
    `Read \`${report}\` and ${folder}-other/report.md.`,
  );
  expect(examples).toContain('"workspacePath":"dead-opus/issues-final.md"');
  expect(examples).not.toContain('other/report.md');
});
