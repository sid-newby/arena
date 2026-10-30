import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import {
  WorkspaceManager,
  containsPath,
  type WorkspaceSeat,
  type SeatWorkspace,
} from '../workspaces/workspace-manager.js';
import { CommandSandbox } from './command-sandbox.js';

export type ToolProfile = 'analysis' | 'build';
export interface BrokerToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const pathProperty = { type: 'string', description: 'A relative path inside this seat workspace.' };
const definitions: BrokerToolDefinition[] = [
  {
    name: 'list_workspace',
    description:
      'List names inside your own workspace. Protected and symlink paths are unavailable.',
    inputSchema: schema({ path: pathProperty }),
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 file inside your own workspace, up to 256 KiB.',
    inputSchema: schema({ path: pathProperty }, ['path']),
  },
  {
    name: 'search_files',
    description: 'Search literal text in your own workspace. Results and file sizes are bounded.',
    inputSchema: schema({ path: pathProperty, query: { type: 'string' } }, ['query']),
  },
  {
    name: 'write_file',
    description:
      'Atomically write UTF-8 text in your own workspace. Supply expectedSha256 to reject a stale edit.',
    inputSchema: schema(
      { path: pathProperty, text: { type: 'string' }, expectedSha256: { type: 'string' } },
      ['path', 'text'],
    ),
  },
  {
    name: 'patch_file',
    description:
      'Replace one unique literal occurrence in a workspace file. Fails when the context is absent or ambiguous.',
    inputSchema: schema(
      { path: pathProperty, find: { type: 'string' }, replace: { type: 'string' } },
      ['path', 'find', 'replace'],
    ),
  },
  {
    name: 'run_command',
    description:
      'Run an argv command inside your workspace with restricted reads, writes, output, and duration. Network access is available. No provider credentials are passed.',
    inputSchema: schema(
      {
        argv: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 64 },
        cwd: pathProperty,
        timeoutMs: { type: 'integer', minimum: 1, maximum: 120000 },
      },
      ['argv'],
    ),
  },
  {
    name: 'publish_artifact',
    description:
      'Publish an immutable snapshot of a workspace file up to 10 MiB. Publishing does not grant the other seat access during independent work.',
    inputSchema: schema({ path: pathProperty, title: { type: 'string' } }, ['path']),
  },
];
const FILE_WORKER = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = fs.realpathSync(data.root);
const protectedPart = value => value === '.git' || value === '.room' || value === '.ssh' || value === '.aws' || value === '.codex' || value.startsWith('.env') || value.startsWith('.tool-');
function target(value, writing = false) {
  if (typeof value !== 'string' || value.includes('\0') || path.isAbsolute(value) || value.split(/[\\/]/).some(v => v === '..' || protectedPart(v))) throw Error('Path is outside the permitted workspace.');
  const parts = value.split('/').filter(v => v && v !== '.');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const entry = fs.lstatSync(current);
      if (entry.isSymbolicLink()) throw Error('Symlink paths are unavailable.');
      if (i < parts.length - 1 && !entry.isDirectory()) throw Error('A parent path is not a directory.');
    } catch (e) {
      if (e.code !== 'ENOENT' || !writing) throw e;
      if (i < parts.length - 1) fs.mkdirSync(current, { mode: 0o700 });
    }
  }
  return current;
}
function read(file, maximum) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > maximum) throw Error('File is not a regular file or exceeds the size limit.');
    const content = Buffer.allocUnsafe(maximum + 1);
    let bytes = 0;
    while (bytes < content.length) {
      const count = fs.readSync(fd, content, bytes, content.length - bytes, bytes);
      if (count === 0) break;
      bytes += count;
    }
    if (bytes > maximum) throw Error('File exceeds the size limit.');
    return content.subarray(0, bytes);
  } finally { fs.closeSync(fd); }
}
function write(file, text) {
  const temporary = path.join(path.dirname(file), '.tool-write-' + crypto.randomUUID());
  try {
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
}
try {
  const file = target(data.path || '', data.action === 'write_file');
  let result;
  if (data.action === 'list_workspace') {
    result = { entries: fs.readdirSync(file, { withFileTypes: true }).filter(e => !e.isSymbolicLink() && !protectedPart(e.name)).slice(0, 200).map(e => ({ name: e.name, directory: e.isDirectory() })) };
  } else if (data.action === 'read_file') {
    const content = read(file, 256 * 1024);
    if (content.includes(0)) throw Error('Use artifact publication for binary files.');
    result = { path: data.path, text: content.toString('utf8'), sha256: crypto.createHash('sha256').update(content).digest('hex') };
  } else if (data.action === 'search_files') {
    const matches = []; let files = 0;
    function walk(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (files >= 200 || matches.length >= 100) return;
        if (entry.isSymbolicLink() || protectedPart(entry.name) || entry.name === 'node_modules') continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile()) {
          files++;
          let content; try { content = read(absolute, 1024 * 1024); } catch { continue; }
          if (content.includes(0)) continue;
          content.toString('utf8').split('\n').forEach((line, i) => {
            if (matches.length < 100 && line.includes(data.query)) matches.push({ path: path.relative(root, absolute), line: i + 1, text: line.slice(0, 500) });
          });
        }
      }
    }
    walk(file); result = { matches, filesInspected: files, bounded: files >= 200 || matches.length >= 100 };
  } else if (data.action === 'write_file' || data.action === 'patch_file') {
    let text = data.text;
    if (data.action === 'patch_file' || data.expectedSha256) {
      const previous = read(file, 256 * 1024).toString('utf8');
      if (data.expectedSha256 && crypto.createHash('sha256').update(previous).digest('hex') !== data.expectedSha256) throw Error('The file changed since it was read.');
      if (data.action === 'patch_file') {
        const index = previous.indexOf(data.find);
        if (index < 0 || previous.indexOf(data.find, index + data.find.length) >= 0) throw Error('Patch context must occur exactly once.');
        text = previous.slice(0, index) + data.replace + previous.slice(index + data.find.length);
      }
    }
    if (Buffer.byteLength(text) > 256 * 1024) throw Error('File text exceeds 256 KiB.');
    write(file, text); result = { path: data.path, bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex') };
  } else if (data.action === 'publish_artifact') {
    const content = read(file, 10 * 1024 * 1024); result = { content: content.toString('base64') };
  } else throw Error('Unknown workspace operation.');
  console.log(JSON.stringify({ ok: true, result }));
} catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
`;
function text(input: Record<string, unknown>, field: string, maximum = 16000): string {
  const value = input[field];
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error(`Provide ${field} as text of at most ${maximum} characters.`);
  return value;
}
function relativePath(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value
      .split('/')
      .some(
        (part) =>
          part === '..' ||
          ['.git', '.room', '.ssh', '.aws', '.codex'].includes(part) ||
          part.startsWith('.env') ||
          part.startsWith('.tool-'),
      )
  )
    throw new Error('Path is outside the permitted workspace.');
  return value;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export class ToolBroker {
  private readonly pending = new Map<string, Promise<void>>();
  constructor(
    private readonly manager: WorkspaceManager,
    private readonly sandbox = new CommandSandbox(),
  ) {}
  definitions(profile: ToolProfile = 'analysis'): BrokerToolDefinition[] {
    return structuredClone(
      definitions.filter(
        (entry) =>
          profile === 'build' || !['write_file', 'patch_file', 'run_command'].includes(entry.name),
      ),
    );
  }
  call(request: {
    runId: string;
    seat: WorkspaceSeat;
    turnId: string;
    name: string;
    input: Record<string, unknown>;
    signal?: AbortSignal;
    profile?: ToolProfile;
  }): Promise<string> {
    const key = JSON.stringify([request.runId, request.seat]);
    const previous = this.pending.get(key) ?? Promise.resolve();
    const result = previous.then(() => this.execute(request));
    const tail = result.then(
      () => {},
      () => {},
    );
    this.pending.set(key, tail);
    void tail.then(() => {
      if (this.pending.get(key) === tail) this.pending.delete(key);
    });
    return result;
  }
  private async execute(request: {
    runId: string;
    seat: WorkspaceSeat;
    turnId: string;
    name: string;
    input: Record<string, unknown>;
    signal?: AbortSignal;
    profile?: ToolProfile;
  }): Promise<string> {
    request.signal?.throwIfAborted();
    const definition = this.definitions(request.profile).find(
      (entry) => entry.name === request.name,
    );
    if (!definition) throw new Error('Tool is outside the workspace capability profile.');
    const properties = definition.inputSchema.properties;
    if (!object(properties) || Object.keys(request.input).some((key) => !(key in properties)))
      throw new Error('Tool input contains unsupported fields.');
    const workspace = this.manager.workspace(request.runId, request.seat);
    if (request.name === 'run_command')
      return this.command(workspace, request.input, request.signal);
    const payload: Record<string, unknown> = {
      root: workspace.root,
      action: request.name,
      path: request.input.path === undefined ? '.' : relativePath(text(request.input, 'path')),
    };
    if (
      ['read_file', 'write_file', 'patch_file', 'publish_artifact'].includes(request.name) &&
      request.input.path === undefined
    )
      throw new Error('Provide a file path.');
    if (request.name === 'search_files') {
      payload.query = text(request.input, 'query', 1000);
      if (!payload.query) throw new Error('Provide a non-empty search query.');
    }
    if (request.name === 'write_file') {
      payload.text = text(request.input, 'text', 256 * 1024);
      if (request.input.expectedSha256 !== undefined) {
        const hash = text(request.input, 'expectedSha256');
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Provide a valid expectedSha256.');
        payload.expectedSha256 = hash;
      }
    }
    if (request.name === 'patch_file') {
      payload.find = text(request.input, 'find', 256 * 1024);
      payload.replace = text(request.input, 'replace', 256 * 1024);
      if (!payload.find) throw new Error('Patch context cannot be empty.');
    }
    const result = await this.sandbox.run({
      workspace,
      argv: [process.execPath, '--input-type=commonjs', '-e', FILE_WORKER],
      cwd: workspace.root,
      stdin: JSON.stringify(payload),
      signal: request.signal,
      timeoutMs: 10_000,
      maxOutputBytes: request.name === 'publish_artifact' ? 15 * 1024 * 1024 : 2 * 1024 * 1024,
    });
    if (result.cancelled) throw new Error('Tool operation cancelled.');
    if (result.timedOut || result.truncated || result.signal)
      throw new Error('Workspace operation exceeded its execution limit.');
    let response: unknown;
    try {
      response = JSON.parse(result.stdout);
    } catch {
      throw new Error(`Workspace operation failed. ${result.stderr.slice(0, 500)}`);
    }
    if (!object(response) || response.ok !== true || !object(response.result))
      throw new Error(
        object(response) && typeof response.error === 'string'
          ? response.error
          : 'Workspace operation failed.',
      );
    if (request.name === 'publish_artifact') {
      if (typeof response.result.content !== 'string')
        throw new Error('Artifact content could not be read.');
      const path = text(request.input, 'path');
      const title =
        request.input.title === undefined ? undefined : text(request.input, 'title', 200);
      return JSON.stringify(
        this.manager.publish({
          workspace,
          turnId: request.turnId,
          path,
          title,
          content: Buffer.from(response.result.content, 'base64'),
        }),
      );
    }
    return JSON.stringify(response.result);
  }
  private async command(
    workspace: SeatWorkspace,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<string> {
    if (
      !Array.isArray(input.argv) ||
      input.argv.length < 1 ||
      input.argv.length > 64 ||
      !input.argv.every(
        (arg) => typeof arg === 'string' && arg.length <= 16000 && !arg.includes('\0'),
      )
    )
      throw new Error('Provide argv as 1 to 64 command arguments.');
    const argv: string[] = input.argv;
    if (argv.reduce((bytes, argument) => bytes + Buffer.byteLength(argument) + 1, 0) > 64 * 1024)
      throw new Error('Command arguments exceed the 64 KiB limit.');
    const cwd =
      input.cwd === undefined
        ? workspace.root
        : resolve(workspace.root, relativePath(text(input, 'cwd')));
    if (!containsPath(workspace.root, realpathSync(cwd)))
      throw new Error('Command directory is outside the workspace.');
    const timeoutMs = input.timeoutMs ?? 30_000;
    if (
      typeof timeoutMs !== 'number' ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 120_000
    )
      throw new Error('Command timeout must be between 1 and 120000 milliseconds.');
    return JSON.stringify(await this.sandbox.run({ workspace, argv, cwd, timeoutMs, signal }));
  }
}
