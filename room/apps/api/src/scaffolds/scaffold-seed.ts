import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandboxProfile } from '../tools/command-sandbox.js';
import { discoverScaffolds } from './scaffold-discovery.controller.js';

const execute = promisify(execFile);
const pending = new Map<
  string,
  Promise<{ repository: string; revision: string; digest: string }>
>();
export function scaffoldRoot(): string {
  return join(
    dirname(
      resolve(
        process.env.ROOM_WORKSPACE ?? fileURLToPath(new URL('../../../../', import.meta.url)),
      ),
    ),
    'scaffolds',
  );
}
export function templateDigest(root: string): string {
  const hash = createHash('sha256');
  let bytes = 0;
  const visit = (relative: string) => {
    for (const name of readdirSync(join(root, relative)).toSorted()) {
      if (['.git', 'node_modules', '.DS_Store', '.maestro-scaffold.json'].includes(name)) continue;
      const path = join(root, relative, name),
        info = lstatSync(path),
        entry = join(relative, name);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
        throw new Error('Scaffolds must contain regular files and directories only.');
      hash.update(JSON.stringify([entry, info.isDirectory() ? 'directory' : info.mode & 0o777]));
      if (info.isDirectory()) visit(entry);
      else {
        bytes += info.size;
        if (bytes > 64 * 1024 * 1024) throw new Error('Scaffold exceeds 64 MiB.');
        hash.update(readFileSync(path));
      }
    }
  };
  visit('');
  return hash.digest('hex');
}
async function git(path: string, args: string[]): Promise<string> {
  return (
    await execute(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'gc.auto=0',
        '-c',
        'maintenance.auto=false',
        '-c',
        'commit.gpgsign=false',
        '-C',
        path,
        ...args,
      ],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          HOME: path,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
          GIT_AUTHOR_NAME: 'Maestro',
          GIT_AUTHOR_EMAIL: 'maestro@localhost',
          GIT_COMMITTER_NAME: 'Maestro',
          GIT_COMMITTER_EMAIL: 'maestro@localhost',
        },
      },
    )
  ).stdout.trim();
}
export function prepareScaffoldSeed(
  controlRoot: string,
  selection: { id: string; digest?: string },
  root = scaffoldRoot(),
) {
  const key = `${controlRoot}:${selection.id}:${selection.digest ?? ''}`;
  const prior = pending.get(key);
  if (prior) return prior;
  const result = prepare(controlRoot, selection, root).finally(() => pending.delete(key));
  pending.set(key, result);
  return result;
}
async function prepare(
  controlRoot: string,
  selection: { id: string; digest?: string },
  root: string,
) {
  if (!discoverScaffolds(root).scaffolds.some((item) => item.id === selection.id))
    throw new Error('Selected scaffold is unavailable.');
  const source = realpathSync(join(root, selection.id, 'template'));
  const digest = templateDigest(source);
  if (selection.digest && selection.digest !== digest)
    throw new Error('The selected scaffold changed. Review it again before preparing.');
  const seeds = join(controlRoot, 'scaffold-seeds');
  mkdirSync(seeds, { recursive: true, mode: 0o700 });
  const repository = join(realpathSync(seeds), `${selection.id}-${digest}`);
  const readSeed = async () => {
    const marker = JSON.parse(readFileSync(join(repository, '.maestro-scaffold.json'), 'utf8'));
    if (
      marker.digest !== digest ||
      marker.id !== selection.id ||
      lstatSync(repository).isSymbolicLink()
    )
      throw new Error('Scaffold seed ownership mismatch.');
    if (templateDigest(repository) !== digest || (await git(repository, ['status', '--porcelain'])))
      throw new Error('Scaffold seed has changed.');
    const revision = await git(repository, ['rev-parse', '--verify', 'HEAD']);
    return { repository, revision, digest };
  };
  if (existsSync(repository)) return readSeed();
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec'))
    throw new Error('Contained scaffold preparation requires macOS sandbox-exec.');
  const stage = join(realpathSync(seeds), `.preparing-${randomUUID()}`);
  mkdirSync(stage, { mode: 0o700 });
  try {
    const script = `const fs=require('node:fs'),p=require('node:path');const [s,d]=process.argv.slice(1);function copy(a,b){for(const n of fs.readdirSync(a)){if(['.git','node_modules','.DS_Store'].includes(n))continue;const x=p.join(a,n),y=p.join(b,n),st=fs.lstatSync(x);if(st.isSymbolicLink())throw Error('Symlink in scaffold');if(st.isDirectory()){fs.mkdirSync(y);copy(x,y)}else if(st.isFile()){fs.copyFileSync(x,y,fs.constants.COPYFILE_EXCL);fs.chmodSync(y,st.mode&511)}else throw Error('Unsupported scaffold file')}}copy(s,d)`;
    const profile = sandboxProfile({
      runId: 'scaffold',
      seat: 'a',
      root: stage,
      source: null,
      readOnlyRoots: [source, dirname(realpathSync(process.execPath))],
    });
    await execute(
      '/usr/bin/sandbox-exec',
      ['-p', profile, process.execPath, '-e', script, source, stage],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        cwd: stage,
        env: { PATH: process.env.PATH, HOME: stage, TMPDIR: stage },
      },
    );
    if (templateDigest(stage) !== digest || templateDigest(source) !== digest)
      throw new Error('Scaffold changed while preparing. Retry after reviewing it.');
    writeFileSync(
      join(stage, '.maestro-scaffold.json'),
      JSON.stringify({ id: selection.id, digest }),
      { mode: 0o600 },
    );
    await git(stage, ['init', '--initial-branch=main']);
    await git(stage, ['add', '--force', '--all']);
    await git(stage, ['commit', '-m', `Initialize ${selection.id} scaffold`]);
    try {
      renameSync(stage, repository);
    } catch (error) {
      if (!existsSync(repository)) throw error;
    }
    return await readSeed();
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
