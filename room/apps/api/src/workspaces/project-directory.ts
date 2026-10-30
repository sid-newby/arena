import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const readme = '# TBD\n\nTBD\n';
const ignore = 'node_modules/\ndist/\ncoverage/\n.env\n.env.*\n.DS_Store\nlilbits/\n';

async function git(directory: string, args: string[]) {
  return (
    await exec(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', directory, ...args],
      {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_TERMINAL_PROMPT: '0',
          LANG: 'C',
        },
      },
    )
  ).stdout.trim();
}

export function projectPath(input: string) {
  if (!isAbsolute(input) || input.includes('\0'))
    throw new Error('Choose an absolute project folder path.');
  const path = resolve(input);
  let current = parse(path).root;
  for (const segment of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, segment);
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('Project paths cannot contain symbolic links or files.');
  }
  return path;
}

export async function canInitializeProject(input: string) {
  const path = projectPath(input);
  if (!existsSync(path)) return existsSync(dirname(path));
  const entries = readdirSync(path);
  if (!entries.length) return true;
  if (entries.some((name) => !['.git', 'README.md', '.gitignore'].includes(name))) return false;
  for (const [name, expected] of [
    ['README.md', readme],
    ['.gitignore', ignore],
  ] as const) {
    const file = join(path, name);
    if (
      existsSync(file) &&
      (!lstatSync(file).isFile() ||
        lstatSync(file).isSymbolicLink() ||
        readFileSync(file, 'utf8') !== expected)
    )
      return false;
  }
  const gitPath = join(path, '.git');
  if (!existsSync(gitPath)) return true;
  if (!lstatSync(gitPath).isDirectory() || lstatSync(gitPath).isSymbolicLink()) return false;
  try {
    const files = (await git(path, ['ls-files'])).split('\n').filter(Boolean);
    return (
      realpathSync(await git(path, ['rev-parse', '--show-toplevel'])) === realpathSync(path) &&
      files.every((file) => ['README.md', '.gitignore'].includes(file))
    );
  } catch {
    return false;
  }
}

export async function initializeProject(input: {
  path: string;
  controlRoot: string;
  runId: string;
}) {
  const path = projectPath(input.path);
  if (existsSync(path) && existsSync(join(path, '.git'))) {
    try {
      if (realpathSync(await git(path, ['rev-parse', '--show-toplevel'])) === realpathSync(path)) {
        await git(path, ['rev-parse', '--verify', 'HEAD^{commit}']);
        const marker = join(
          input.controlRoot,
          'project-initializations',
          createHash('sha256').update(path).digest('hex'),
        );
        if (
          existsSync(marker) &&
          readFileSync(marker, 'utf8') === JSON.stringify({ path, runId: input.runId })
        )
          unlinkSync(marker);
        return path;
      }
    } catch {
      /* An incomplete initialization is checked against its marker below. */
    }
  }
  const markers = join(input.controlRoot, 'project-initializations');
  mkdirSync(markers, { recursive: true, mode: 0o700 });
  const marker = join(markers, createHash('sha256').update(path).digest('hex'));
  const identity = JSON.stringify({ path, runId: input.runId });
  if (existsSync(marker)) {
    if (readFileSync(marker, 'utf8') !== identity)
      throw new Error('This project initialization belongs to another run.');
  } else {
    if (existsSync(path)) {
      const entries = readdirSync(path);
      if (entries.length && !(await canInitializeProject(path))) {
        const gitPath = join(path, '.git');
        if (
          entries.length !== 1 ||
          entries[0] !== '.git' ||
          !lstatSync(gitPath).isDirectory() ||
          lstatSync(gitPath).isSymbolicLink()
        )
          throw new Error('Choose an empty project folder or an existing Git repository.');
        try {
          if (
            realpathSync(await git(path, ['rev-parse', '--show-toplevel'])) !==
              realpathSync(path) ||
            (await git(path, ['ls-files']))
          )
            throw new Error('Repository is not empty.');
        } catch {
          throw new Error('Choose an empty project folder or an existing Git repository.');
        }
      }
    }
    writeFileSync(marker, identity, { flag: 'wx', mode: 0o600 });
  }
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const allowed = new Set(['.git', 'README.md', '.gitignore']);
  if (readdirSync(path).some((name) => !allowed.has(name)))
    throw new Error('Project folder changed during initialization.');
  for (const [name, contents] of [
    ['README.md', readme],
    ['.gitignore', ignore],
  ] as const) {
    const file = join(path, name);
    if (existsSync(file)) {
      if (!lstatSync(file).isFile() || readFileSync(file, 'utf8') !== contents)
        throw new Error('Project starter file changed during initialization.');
    } else writeFileSync(file, contents, { flag: 'wx', mode: 0o600 });
  }
  if (!existsSync(join(path, '.git'))) await git(path, ['init', '--initial-branch=main']);
  const markerStat = lstatSync(join(path, '.git'));
  if (
    markerStat.isSymbolicLink() ||
    !markerStat.isDirectory() ||
    realpathSync(await git(path, ['rev-parse', '--show-toplevel'])) !== realpathSync(path)
  )
    throw new Error('Project Git directory changed during initialization.');
  if (existsSync(join(path, '.git', 'info', 'attributes')))
    throw new Error('Project Git attributes must be reviewed before initialization.');
  try {
    const filters = await git(path, ['config', '--get-regexp', '^filter[.].*[.](clean|process)$']);
    if (filters) throw new Error('Project Git filters must be reviewed before initialization.');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 1)) throw error;
  }
  await git(path, ['add', '--', 'README.md', '.gitignore']);
  await git(path, [
    '-c',
    'user.name=Maestro',
    '-c',
    'user.email=maestro@localhost',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'Initialize project',
  ]);
  unlinkSync(marker);
  return realpathSync(path);
}
