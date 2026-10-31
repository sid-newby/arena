import { execFile } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { join, relative, resolve } from 'node:path';
import type { TaskDraft } from '../runs/run.contract.js';
import { containsPath, type WorkspaceSource } from './workspace-manager.js';

const execute = promisify(execFile);

function references(text: string, root: string): string[] {
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}(?=$|[/\\s\x60"'.,;:!?)\\]])`, 'g');
  const paths = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    const previous = text[index - 1] ?? '';
    if (/[\w./-]/.test(previous)) continue;
    const tail = text.slice(index);
    let path: string;
    if (previous === '`' || previous === '"' || previous === "'") {
      const end = tail.indexOf(previous);
      path = end === -1 ? (tail.split('\n')[0] ?? '') : tail.slice(0, end);
    } else {
      const linePrefix = text.slice(text.lastIndexOf('\n', index - 1) + 1, index).trim();
      path =
        linePrefix === '' || /^[-*]$/.test(linePrefix)
          ? (tail.split('\n')[0] ?? '').trim()
          : (tail.match(/^[^\s`"'<>),;!?\]]+/)?.[0] ?? '');
      path = path.replace(/[.,;:!?]+$/, '');
    }
    if (path) paths.add(path);
  }
  return [...paths];
}

export function resolveLockerEvidence(
  roomRoot: string,
  task: TaskDraft,
  frozenEvidence = false,
): TaskDraft {
  if (
    task.mode !== 'reasoning' ||
    task.profile !== 'analysis' ||
    task.source ||
    task.scaffold ||
    task.projectDirectory
  )
    return task;
  const locker = join(resolve(roomRoot), 'evidence');
  const paths = references(task.question, locker);
  if (!paths.length) return task;
  if (frozenEvidence && task.evidenceFolder) {
    if (paths.some((path) => !containsPath(task.evidenceFolder ?? '', resolve(path))))
      throw new Error(
        'A locker reference in the question is outside the selected evidence folder.',
      );
    return task;
  }
  const folders = new Set<string>();
  const canonicalPaths: string[] = [];
  for (const path of paths) {
    try {
      if (
        path
          .slice(locker.length)
          .split('/')
          .some((part) => part.startsWith('.'))
      )
        throw new Error(
          'Choose a visible file inside one locker project, without parent traversal.',
        );
      const absolute = resolve(path);
      const parts = relative(locker, absolute).split('/');
      const project = parts[0];
      if (!containsPath(locker, absolute) || !project || project.startsWith('.'))
        throw new Error('Choose a single project folder inside the local evidence locker.');
      const canonicalLocker = realpathSync(locker);
      if (canonicalLocker !== join(realpathSync(roomRoot), 'evidence'))
        throw new Error('The local evidence locker must not be a symlink.');
      let entry = locker;
      for (const part of parts) {
        entry = join(entry, part);
        if (lstatSync(entry).isSymbolicLink())
          throw new Error('Locker references must not pass through symlinks.');
      }
      const canonical = realpathSync(absolute);
      if (!containsPath(canonicalLocker, canonical))
        throw new Error('The referenced path escapes the local evidence locker.');
      const folder = join(canonicalLocker, project);
      if (!lstatSync(folder).isDirectory())
        throw new Error('Place this file in a project folder before attaching it.');
      if (!lstatSync(canonical).isDirectory() && !lstatSync(canonical).isFile())
        throw new Error('Choose an ordinary file or project folder.');
      canonicalPaths.push(canonical);
      folders.add(folder);
    } catch (error) {
      const reason =
        error instanceof Error && !('code' in error)
          ? error.message
          : 'The referenced file or folder is missing or unreadable.';
      throw new Error(
        `Cannot attach locker reference ${JSON.stringify(path)}. ${reason} Correct the question or choose an explicit evidence folder before preparing.`,
        { cause: error },
      );
    }
  }
  if (task.evidenceFolder) {
    const selected = realpathSync(task.evidenceFolder);
    if (canonicalPaths.some((path) => !containsPath(selected, path)))
      throw new Error(
        'A locker reference in the question is outside the selected evidence folder. Update the question or select the matching evidence folder before preparing.',
      );
    return task;
  }
  if (folders.size !== 1)
    throw new Error(
      'The question references multiple locker projects. Choose one explicit evidence folder or keep references to a single locker project before preparing.',
    );
  const evidenceFolder = folders.values().next().value;
  return evidenceFolder ? { ...task, evidenceFolder } : task;
}

export function evidencePathExamples(folder: string, question: string): string {
  const paths = references(question, folder).flatMap((path) => {
    const absolute = resolve(path);
    return containsPath(folder, absolute)
      ? [{ requested: path, workspacePath: relative(folder, absolute) || '.' }]
      : [];
  });
  return paths.length ? `Referenced paths in this snapshot: ${JSON.stringify(paths)}.\n` : '';
}

export async function verifyEvidenceReferences(
  folder: string,
  question: string,
  source: WorkspaceSource,
): Promise<void> {
  const paths = references(question, folder);
  if (!paths.length) return;
  const { stdout } = await execute(
    'git',
    [
      '-c',
      'core.fsmonitor=false',
      '-C',
      source.repository,
      'ls-tree',
      '-rz',
      '--name-only',
      source.revision,
    ],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 },
  );
  const captured = stdout.split('\0').filter(Boolean);
  for (const path of paths) {
    const absolute = resolve(path);
    const name = relative(folder, absolute);
    if (
      !containsPath(folder, absolute) ||
      (name !== '' && !captured.some((file) => file === name || file.startsWith(`${name}/`)))
    )
      throw new Error(
        `Named evidence reference ${JSON.stringify(path)} is absent from the frozen snapshot. Hidden, private, generated, linked, and empty directories are excluded. Choose an included file or correct the question before preparing.`,
      );
  }
}
