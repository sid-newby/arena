import { spawn } from 'node:child_process';
import { constants, existsSync, realpathSync } from 'node:fs';
import {
  chmod,
  open,
  lstat,
  mkdir,
  mkdtemp,
  copyFile,
  readdir,
  readlink,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve as resolvePath, sep } from 'node:path';
import { privateProjectRoots } from '../workspaces/workspace-paths.js';
import type { SeatWorkspace } from '../workspaces/workspace-manager.js';

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
}
export interface CommandOptions {
  workspace: SeatWorkspace;
  argv: string[];
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
  stdin?: string;
  includeDependencies?: boolean;
  live?: 'files' | 'command';
}
const quote = (value: string) => JSON.stringify(value);
export function sandboxProfile(workspace: SeatWorkspace): string {
  const systemRoots = [
    '/System',
    '/Library/Developer',
    '/Library/Apple',
    '/usr',
    '/bin',
    '/sbin',
    '/opt/homebrew',
    '/private/etc',
    '/private/var/db',
    '/dev',
  ];
  const readRoots = [workspace.root, ...workspace.readOnlyRoots, ...systemRoots];
  const parents = new Set<string>();
  for (const root of readRoots) {
    let parent = dirname(root);
    while (true) {
      parents.add(parent);
      if (parent === parse(parent).root) break;
      parent = dirname(parent);
    }
  }
  const readable = `(require-any ${readRoots.map((root) => `(subpath ${quote(root)})`).join(' ')} ${[...parents].map((path) => `(literal ${quote(path)})`).join(' ')})`;
  const backslash = String.fromCharCode(92);
  const escapedRoot = Array.from(workspace.root, (character) =>
    '.*+?^${}()|[]'.includes(character) || character === backslash
      ? backslash + character
      : character,
  ).join('');
  const protectedPaths = [
    '^' + escapedRoot + '/(.*/)?' + backslash + '.(git|room|ssh|aws|codex)(/|$)',
    '^' + escapedRoot + '/(.*/)?' + backslash + '.env[^/]*(/|$)',
  ]
    .map((pattern) => '#"' + pattern.replaceAll('"', backslash + '"') + '"')
    .join(' ');
  return `(version 1)
(allow default)
(deny file-read-data (require-not ${readable}))
(deny file-write* (require-not (require-any (subpath ${quote(workspace.root)}) (literal "/dev/null") (literal "/dev/tty"))))
(deny file-read* file-write* (regex ${protectedPaths}))
(deny signal (require-not (target self)))
(deny process-info* (require-not (target self)))
(deny mach-lookup)
(deny appleevent-send)`;
}

// Keep the same exclusions in the trusted file worker and the disposable command tree.
export const LIVE_PROTECTED_PART = String.raw`\.(git|room|audit|ssh|aws|codex|claude|gnupg|config|kube|docker|azure|gcloud|worktrees|pnpm-store|cache|netrc|npmrc|pypirc|gitcredentials|git-credentials|gitconfig|DS_Store)|\.env[^/]*|\.tool-[^/]*|id_(rsa|ed25519|ecdsa|dsa)[^/]*|credentials(\.[^/]*)?|secrets?(\.[^/]*)?|service[-_]account[^/]*\.json`;
export const LIVE_PROTECTED_SUFFIX = String.raw`\.(pem|key|p12|pfx|jks|keychain|keychain-db)`;
const hidden = new RegExp('^(?:' + LIVE_PROTECTED_PART + ')$|' + LIVE_PROTECTED_SUFFIX + '$', 'i');
export function protectedProjectPath(path: string) {
  return path.split('/').some((part) => hidden.test(part));
}

// Commands get a throwaway tree: guarded writes are the only path to the real source.
// Copy single-link regular files and verify their identities before releasing the snapshot.
// Relative symlinks are re-created only inside this disposable view.
async function projectSnapshot(
  root: string,
  dest: string,
  includeDependencies: boolean,
  signal?: AbortSignal,
) {
  let entries = 0,
    bytes = 0;
  const hiddenRoots = privateProjectRoots();
  const files: { from: string; to: string }[] = [];
  async function copyRegular({ from, to }: { from: string; to: string }) {
    signal?.throwIfAborted();
    const file = await open(from, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.nlink !== 1) return;
      const actual = await lstat(from);
      if (realpathSync(from) !== from || actual.ino !== info.ino || actual.dev !== info.dev)
        throw new Error('Project file changed during snapshot.');
      bytes += info.size;
      if (bytes > 2 * 1024 ** 3)
        throw new Error('Project exceeds the 2 GiB command snapshot limit.');
      // Clone from the checked descriptor, even if an editor replaces the path meanwhile.
      await copyFile(
        '/dev/fd/' + file.fd,
        to,
        constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL,
      );
      await chmod(to, 0o600 | (info.mode & 0o111));
    } finally {
      await file.close();
    }
  }
  async function flushFiles() {
    const completed = await Promise.allSettled(files.splice(0).map(copyRegular));
    for (const job of completed) if (job.status === 'rejected') throw job.reason;
  }
  async function visit(source: string, target: string) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      signal?.throwIfAborted();
      if (hidden.test(entry.name) || (!includeDependencies && entry.name === 'node_modules'))
        continue;
      if (
        ['dist', 'build', 'coverage', '.next', '.turbo'].includes(entry.name) &&
        !source.includes('/node_modules/')
      )
        continue;
      if (++entries > 180_000) throw new Error('Project exceeds the command snapshot entry limit.');
      const from = join(source, entry.name),
        to = join(target, entry.name);
      if (hiddenRoots.includes(from)) continue;
      if (entry.isDirectory()) {
        // Follow no parent symlinks, even if the directory was replaced during traversal.
        if (realpathSync(from) !== from)
          throw new Error('Project directory changed during snapshot.');
        await mkdir(to, { mode: 0o700 });
        await visit(from, to);
      } else if (entry.isSymbolicLink()) {
        const link = await readlink(from);
        const inside = relative(root, resolvePath(dirname(from), link));
        if (
          !isAbsolute(link) &&
          inside !== '..' &&
          !inside.startsWith('..' + sep) &&
          !protectedProjectPath(inside)
        )
          await symlink(link, to);
      } else if (entry.isFile()) {
        files.push({ from, to });
        if (files.length >= 16) await flushFiles();
      }
    }
  }
  await mkdir(dest, { mode: 0o700 });
  await visit(root, dest);
  await flushFiles();
}

// pnpm exposes its installed executable to the API it launches. Keep the live room's
// package-manager version available independently of the user's shell shims.
function installedPnpmBin() {
  const executable = process.env.npm_execpath;
  return executable?.endsWith('/pnpm/bin/pnpm.native') && existsSync(executable)
    ? dirname(realpathSync(executable))
    : undefined;
}
function liveProfile(root: string, scratch: string, files: boolean, pnpmBin?: string) {
  const node = realpathSync(process.execPath);
  // Homebrew applications resolve into Cellar, not user/home config. System executables
  // need dyld/SDK data; they do not need access to the project owner's home or credentials.
  const reads = [
    root,
    scratch,
    ...(pnpmBin ? [pnpmBin] : []),
    '/System/Library',
    '/usr/bin',
    '/usr/lib',
    '/usr/libexec',
    '/usr/share',
    '/bin',
    '/sbin',
    '/Library/Apple',
    '/Library/Developer/CommandLineTools',
    '/opt/homebrew/Cellar',
    '/opt/homebrew/lib',
    '/opt/homebrew/opt',
  ];
  const literals = [
    node,
    '/dev/null',
    '/dev/zero',
    '/dev/urandom',
    '/dev/random',
    '/dev/fd',
    '/private/etc/localtime',
    '/opt/homebrew/bin/node',
    '/opt/homebrew/bin/task',
    '/opt/homebrew/bin/pnpm',
  ];
  const readable =
    '(require-any ' +
    [
      ...reads.map((p) => '(subpath ' + quote(p) + ')'),
      ...literals.map((p) => '(literal ' + quote(p) + ')'),
    ].join(' ') +
    ')';
  const parents = new Set<string>();
  for (const path of [...reads, ...literals]) {
    let p = dirname(path);
    while (!parents.has(p)) {
      parents.add(p);
      const next = dirname(p);
      if (next === p) break;
      p = next;
    }
  }
  return `(version 1)
(deny default)
(import "dyld-support.sb")
(allow dynamic-code-generation)
(allow process-fork)
(allow process-exec file-read* file-map-executable ${readable})
(allow file-read-metadata ${[...parents].map((p) => '(literal ' + quote(p) + ')').join(' ')})
(allow file-write* (subpath ${quote(scratch)}) ${files ? '(subpath ' + quote(root) + ')' : ''} (literal "/dev/null"))
(allow sysctl-read)
(allow signal process-info* (target self))
(deny file-write-flags file-write-acl)
(deny network*)`;
}

export class CommandSandbox {
  private readonly verified = new Set<string>();
  async run(options: CommandOptions): Promise<CommandResult> {
    options.signal?.throwIfAborted();
    if (options.stdin && Buffer.byteLength(options.stdin) > 2 * 1024 * 1024)
      throw new Error('Command input exceeds its 2 MiB limit.');
    if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec'))
      throw new Error('Contained command execution is unavailable on this platform.');
    if (options.live) return this.live(options);
    const key = sandboxProfile(options.workspace);
    if (!this.verified.has(key)) {
      const probe = await this.spawn(
        {
          ...options,
          argv: [process.execPath, '-e', 'process.stdout.write("sandbox-ready")'],
          cwd: options.workspace.root,
          timeoutMs: 5000,
          maxOutputBytes: 4096,
          stdin: undefined,
        },
        key,
      );
      if (probe.exitCode !== 0 || probe.signal || probe.stdout !== 'sandbox-ready')
        throw new Error(
          `The command sandbox could not start. ${probe.stderr.trim() || probe.signal || ''}`.trim(),
        );
      this.verified.add(key);
    }
    return this.spawn(options, key);
  }
  private async live(options: CommandOptions): Promise<CommandResult> {
    const root = options.workspace.root;
    const directory = realpathSync(await mkdtemp(join(tmpdir(), 'arena-project-')));
    try {
      const files = options.live === 'files';
      const project = files ? root : join(directory, 'project');
      const home = join(directory, 'home');
      const temp = join(directory, 'tmp');
      await mkdir(home, { mode: 0o700 });
      await mkdir(temp, { mode: 0o700 });
      if (!files) {
        if (directory === root || directory.startsWith(root + sep))
          throw new Error('The command scratch directory must be outside the attached project.');
        const deadline = AbortSignal.timeout(60_000);
        await projectSnapshot(
          root,
          project,
          options.includeDependencies ?? true,
          options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
        );
      }
      const cwd = files ? root : join(project, relative(root, options.cwd));
      const pnpmBin = installedPnpmBin();
      return await this.spawn(
        { ...options, cwd },
        liveProfile(project, directory, files, pnpmBin),
        {
          pnpmBin,
          home,
          temp,
        },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private spawn(
    options: CommandOptions,
    profile: string,
    scratch?: { home: string; temp: string; pnpmBin?: string },
  ): Promise<CommandResult> {
    const executableDirectory = dirname(realpathSync(process.execPath));
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, ...options.argv], {
        cwd: options.cwd,
        detached: true,
        env: {
          PATH: [
            executableDirectory,
            scratch?.pnpmBin,
            '/opt/homebrew/bin',
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin',
          ]
            .filter(Boolean)
            .join(':'),
          HOME: scratch?.home ?? join(options.workspace.root, '.tool-home'),
          TMPDIR: scratch?.temp ?? join(options.workspace.root, '.tool-tmp'),
          ...(scratch
            ? {
                XDG_CACHE_HOME: join(scratch.home, 'cache'),
                COREPACK_ENABLE_NETWORK: '0',
                npm_config_offline: 'true',
              }
            : {}),
          LANG: 'en_US.UTF-8',
          CI: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdin.on('error', () => {});
      child.stdin.end(options.stdin ?? '');
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let truncated = false;
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const maximum = options.maxOutputBytes ?? 64 * 1024;
      const killGroup = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          process.kill(-child.pid, signal);
        } catch {
          /* The group may have exited already. */
        }
      };
      const terminate = () => {
        killGroup('SIGTERM');
        killTimer ??= setTimeout(() => killGroup('SIGKILL'), 500);
      };
      const abort = () => {
        cancelled = true;
        terminate();
      };
      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, options.timeoutMs ?? 30_000);
      const collect = (chunk: Buffer, kind: 'stdout' | 'stderr') => {
        const available = Math.max(0, maximum - bytes);
        const text = chunk.subarray(0, available).toString('utf8');
        if (kind === 'stdout') stdout += text;
        else stderr += text;
        bytes += Math.min(chunk.length, available);
        if (chunk.length > available) {
          truncated = true;
          terminate();
        }
      };
      child.stdout.on('data', (chunk: Buffer) => collect(chunk, 'stdout'));
      child.stderr.on('data', (chunk: Buffer) => collect(chunk, 'stderr'));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const finish = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        child.stdin.destroy();
        if (killTimer) clearTimeout(killTimer);
        options.signal?.removeEventListener('abort', abort);
        killGroup('SIGKILL');
        return true;
      };
      child.once('error', (error) => {
        if (finish()) reject(error);
      });
      child.once('close', (exitCode, signal) => {
        if (finish()) resolve({ exitCode, signal, stdout, stderr, truncated, timedOut, cancelled });
      });
    });
  }
}
