import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { containsPath, type WorkspaceSource } from './workspace-manager.js';

const execute = promisify(execFile);
const quote = (value: string) => JSON.stringify(value);
const maximumBytes = 20 * 1024 * 1024;
const maximumFiles = 5000;
const excludedDirectories = [
  'node_modules',
  'vendor',
  'bower_components',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'venv',
  '__pycache__',
];
const privateFile =
  /^(?:credentials?|secrets?|passwords?)(?:[.](?:json|ya?ml|toml|ini|txt))?$|^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:[.]|$)|[.](?:pem|key|p12|pfx|keystore|sqlite[0-9]*|db)$/i;

function canonicalPath(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  if (parent === absolute) throw new Error('The evidence folder path is unavailable.');
  return join(canonicalPath(parent), basename(absolute));
}

export function validateEvidenceFolder(
  controlRoot: string,
  managedRoot: string,
  folder: string,
): string {
  if (!isAbsolute(folder)) throw new Error('Choose an absolute evidence folder path.');
  let source: string;
  try {
    const stat = lstatSync(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('Choose a real directory for the evidence folder, without a symlink.');
    accessSync(folder, constants.R_OK);
    source = realpathSync(folder);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Choose a real directory')) throw error;
    throw new Error('The evidence folder is missing or unreadable. Choose an available folder.', {
      cause: error,
    });
  }
  if (
    source === dirname(source) ||
    source === canonicalPath(homedir()) ||
    source.split('/').some((part) => part.startsWith('.'))
  )
    throw new Error(
      'Choose a project or document folder outside hidden folders, rather than your home or filesystem root.',
    );
  if (
    containsPath(canonicalPath(controlRoot), source) ||
    containsPath(canonicalPath(managedRoot), source)
  )
    throw new Error(
      'Choose an evidence folder outside private control state and managed workspaces.',
    );
  return source;
}

interface CapturedFile {
  path: string;
  content: string;
  executable: boolean;
}

// A sandbox is required because checking paths alone cannot close directory-swap races.
const captureScript = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const input = JSON.parse(process.argv[1]);
const files = [];
let bytes = 0;
let visited = 0;
const root = input.source;
const inside = (base, value) => value === base || value.startsWith(base + '/');
const forbidden = new RegExp(input.privatePattern, 'i');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const verify = (name) => {
  const real = fs.realpathSync(name);
  if (real !== name || !inside(root, real) || input.excluded.some(base => inside(base, real)))
    throw new Error('Evidence folder changed during capture. Try again.');
};
const walk = (directory, depth) => {
  if (depth > 32) throw new Error('Evidence folders are limited to 32 directory levels.');
  verify(directory);
  const before = fs.lstatSync(directory);
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('Evidence folder changed during capture.');
  const listing = fs.opendirSync(directory);
  try {
    for (let entry; (entry = listing.readSync()) !== null;) {
      if (++visited > input.maximumFiles) throw new Error('Evidence folders are limited to 5000 entries. Choose a smaller folder.');
      const name = entry.name;
      if (name.startsWith('.') || forbidden.test(name) || input.excludedDirectories.includes(name.toLowerCase())) continue;
      const absolute = path.join(directory, name);
      if (input.excluded.some(base => inside(base, absolute))) continue;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(absolute, depth + 1);
      } else if (stat.isFile()) {
        if (stat.nlink > 1) continue;
        if (stat.size > 5 * 1024 * 1024 || bytes + stat.size > input.maximumBytes)
          throw new Error('Evidence is limited to 5 MiB per file and 20 MiB total. Choose a smaller folder.');
        verify(directory);
        const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try {
          const opened = fs.fstatSync(fd);
          if (!opened.isFile() || opened.nlink !== 1 || !same(stat, opened)) throw new Error('Evidence file changed during capture.');
          const content = Buffer.alloc(opened.size);
          let offset = 0;
          while (offset < content.length) {
            const count = fs.readSync(fd, content, offset, content.length - offset, offset);
            if (count === 0) throw new Error('Evidence file changed during capture.');
            offset += count;
          }
          if (!same(opened, fs.fstatSync(fd))) throw new Error('Evidence file changed during capture.');
          verify(directory);
          files.push({path: path.relative(root, absolute), content: content.toString('base64'), executable: Boolean(opened.mode & 0o111)});
          bytes += content.length;
        } finally { fs.closeSync(fd); }
      }
    }
  } finally { listing.closeSync(); }
  verify(directory);
  if (!same(before, fs.lstatSync(directory))) throw new Error('Evidence folder changed during capture. Try again.');
};
try {
  walk(root, 0);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  process.stdout.write(JSON.stringify(files));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
`;

function captureProfile(source: string, excluded: string[]): string {
  const runtime = [
    '/System',
    '/usr',
    '/bin',
    '/sbin',
    '/opt/homebrew',
    '/Library/Apple',
    '/private/var/db',
    '/private/etc',
    '/dev',
    dirname(realpathSync(process.execPath)),
  ];
  const parents = new Set<string>();
  for (const root of [source, ...runtime]) {
    let parent = dirname(root);
    while (true) {
      parents.add(parent);
      if (parent === dirname(parent)) break;
      parent = dirname(parent);
    }
  }
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hidden = `${escaped}/(.*/)?[.][^/]*(/|$)`;
  const protectedNames = `${escaped}/(.*/)?(${excludedDirectories.join('|')})(/|$)`;
  return `(version 1)
(allow default)
(deny file-read-data (require-not (require-any ${[source, ...runtime].map((path) => `(subpath ${quote(path)})`).join(' ')} ${[...parents].map((path) => `(literal ${quote(path)})`).join(' ')})))
(deny file-write* (require-not (literal "/dev/null")))
(deny file-read* (regex #${quote(hidden)} #${quote(protectedNames)}))
${excluded.map((path) => `(deny file-read* (subpath ${quote(path)}))`).join('\n')}
(deny network*)
(deny mach-lookup)
(deny appleevent-send)`;
}

async function capture(source: string, excluded: string[]): Promise<CapturedFile[]> {
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec'))
    throw new Error('Contained evidence folder capture is unavailable on this platform.');
  try {
    const { stdout } = await execute(
      '/usr/bin/sandbox-exec',
      [
        '-p',
        captureProfile(source, excluded),
        process.execPath,
        '-e',
        captureScript,
        JSON.stringify({
          source,
          excluded,
          excludedDirectories,
          privatePattern: privateFile.source,
          maximumBytes,
          maximumFiles,
        }),
      ],
      {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: maximumBytes * 2,
        env: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/nonexistent' },
      },
    );
    const value: unknown = JSON.parse(stdout);
    if (!Array.isArray(value) || value.length > maximumFiles)
      throw new Error('Invalid evidence capture.');
    return value.map((entry: unknown) => {
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !('path' in entry) ||
        typeof entry.path !== 'string' ||
        !('content' in entry) ||
        typeof entry.content !== 'string' ||
        !('executable' in entry) ||
        typeof entry.executable !== 'boolean' ||
        entry.path.split('/').some((part) => !part || part.startsWith('.')) ||
        isAbsolute(entry.path)
      )
        throw new Error('Invalid evidence capture.');
      return { path: entry.path, content: entry.content, executable: entry.executable };
    });
  } catch (error) {
    const detail =
      error !== null &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr.trim().slice(0, 500)
        : '';
    throw new Error(
      `Evidence folder capture failed.${detail ? ` ${detail}` : ' The folder may have changed or the capture sandbox could not start.'}`,
      { cause: error },
    );
  }
}

async function seedGit(repository: string, args: string[]): Promise<string> {
  const { stdout } = await execute(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.attributesFile=/dev/null',
      '-C',
      repository,
      ...args,
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'Evidence snapshot',
        GIT_AUTHOR_EMAIL: 'evidence@room.invalid',
        GIT_COMMITTER_NAME: 'Evidence snapshot',
        GIT_COMMITTER_EMAIL: 'evidence@room.invalid',
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
        LANG: 'C',
      },
    },
  );
  return stdout.trim();
}

export async function prepareEvidenceSeed(
  controlRoot: string,
  managedRoot: string,
  folder: string,
): Promise<WorkspaceSource> {
  const source = validateEvidenceFolder(controlRoot, managedRoot, folder);
  const excluded = [canonicalPath(controlRoot), canonicalPath(managedRoot)];
  const files = await capture(source, excluded);
  const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const seeds = join(realpathSync(controlRoot), 'evidence');
  mkdirSync(seeds, { recursive: true, mode: 0o700 });
  if (realpathSync(seeds) !== seeds) throw new Error('Evidence seed storage changed.');
  const repository = join(seeds, digest);
  const temporary = mkdtempSync(join(seeds, 'capture-'));
  try {
    for (const file of files) {
      const destination = join(temporary, file.path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, Buffer.from(file.content, 'base64'), {
        mode: file.executable ? 0o700 : 0o600,
        flag: 'wx',
      });
    }
    await seedGit(temporary, ['init', '-q', '--template=', '--initial-branch=evidence']);
    await seedGit(temporary, ['add', '--all', '--', '.']);
    await seedGit(temporary, ['commit', '--allow-empty', '-qm', 'Frozen folder evidence']);
    const revision = await seedGit(temporary, ['rev-parse', 'HEAD']);
    try {
      renameSync(temporary, repository);
    } catch (error) {
      if (!existsSync(repository)) throw error;
      if (
        lstatSync(repository).isSymbolicLink() ||
        realpathSync(repository) !== repository ||
        (await seedGit(repository, ['rev-parse', 'HEAD'])) !== revision
      )
        throw new Error('Existing evidence seed does not match its captured contents.', {
          cause: error,
        });
    }
    return { repository, revision };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
