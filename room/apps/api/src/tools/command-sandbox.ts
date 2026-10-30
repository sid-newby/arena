import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
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
export class CommandSandbox {
  private readonly verified = new Set<string>();
  async run(options: CommandOptions): Promise<CommandResult> {
    options.signal?.throwIfAborted();
    if (options.stdin && Buffer.byteLength(options.stdin) > 2 * 1024 * 1024)
      throw new Error('Command input exceeds its 2 MiB limit.');
    if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec'))
      throw new Error('Contained command execution is unavailable on this platform.');
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
  private spawn(options: CommandOptions, profile: string): Promise<CommandResult> {
    const executableDirectory = dirname(realpathSync(process.execPath));
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, ...options.argv], {
        cwd: options.cwd,
        detached: true,
        env: {
          PATH: `${executableDirectory}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
          HOME: join(options.workspace.root, '.tool-home'),
          TMPDIR: join(options.workspace.root, '.tool-tmp'),
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
