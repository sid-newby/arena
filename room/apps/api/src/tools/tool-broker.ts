import { resolve } from 'node:path';
import { privateProjectRoots } from '../workspaces/workspace-paths.js';
import { realpathSync, statSync } from 'node:fs';
import {
  WorkspaceManager,
  containsPath,
  type WorkspaceSeat,
  type SeatWorkspace,
} from '../workspaces/workspace-manager.js';
import {
  CommandSandbox,
  LIVE_PROTECTED_PART,
  LIVE_PROTECTED_SUFFIX,
  protectedProjectPath,
} from './command-sandbox.js';

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
    name: 'publish_text_artifact',
    description:
      'Publish your completed text as an immutable artifact up to 256 KiB. Provide a relative output filename and text directly; no file-write tool or existing workspace file is needed. Available in analysis and build profiles. Does not edit workspace files or expose the artifact to the other seat during independent work.',
    inputSchema: schema(
      { path: pathProperty, text: { type: 'string' }, title: { type: 'string' } },
      ['path', 'text'],
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
const livePart = new RegExp('^(?:' + data.protectedPart + ')$', 'i');
const liveSuffix = new RegExp(data.protectedSuffix + '$', 'i');
const privatePath = value => data.live && data.privateRoots.some(p => value.toLowerCase() === p.toLowerCase() || value.toLowerCase().startsWith(p.toLowerCase() + path.sep));
const protectedPart = value => (data.live && (livePart.test(value) || liveSuffix.test(value))) || value === '.git' || value === '.room' || value === '.ssh' || value === '.aws' || value === '.codex' || value.startsWith('.env') || value.startsWith('.tool-');
function target(value, writing = false) {
  if (typeof value !== 'string' || value.includes('\0') || path.isAbsolute(value) || value.split(/[\\/]/).some(v => v === '..' || protectedPart(v))) throw Error('Path is outside the permitted workspace.');
  const parts = value.split('/').filter(v => v && v !== '.');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (privatePath(current)) throw Error('Protected project directory.');
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
    if (!info.isFile() || (data.live && info.nlink !== 1) || info.size > maximum) throw Error('File is not a regular file or exceeds the size limit.');
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
function write(file, text, mode, createOnly) {
  const temporary = path.join(path.dirname(file), '.tool-write-' + crypto.randomUUID());
  try {
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, text); if (mode !== undefined) fs.fchmodSync(fd, mode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (createOnly) fs.linkSync(temporary, file); else fs.renameSync(temporary, file);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
}
try {
  const file = target(data.path || '', data.action === 'write_file');
  let result;
  if (data.action === 'list_workspace') {
    result = { entries: fs.readdirSync(file, { withFileTypes: true }).filter(e => !e.isSymbolicLink() && !protectedPart(e.name) && !privatePath(path.join(file,e.name))).slice(0, 200).map(e => ({ name: e.name, directory: e.isDirectory() })) };
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
        if (privatePath(absolute)) continue;
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
    const exists = fs.existsSync(file);
    if (data.live && exists && !data.expectedSha256) throw Error('Provide expectedSha256 from project_read to edit an existing file.');
    const mode = data.live && exists ? fs.lstatSync(file).mode & 0o777 : undefined;
    if (data.action === 'patch_file' || data.expectedSha256) {
      const bytes = read(file, 256 * 1024);
      if (data.live && (bytes.includes(0) || !bytes.equals(Buffer.from(bytes.toString('utf8'))))) throw Error('Only UTF-8 text files can be edited.');
      const previous = bytes.toString('utf8');
      if (data.expectedSha256 && crypto.createHash('sha256').update(bytes).digest('hex') !== data.expectedSha256) throw Error('The file changed since it was read.');
      if (data.action === 'patch_file') {
        const index = previous.indexOf(data.find);
        if (index < 0 || previous.indexOf(data.find, index + data.find.length) >= 0) throw Error('Patch context must occur exactly once.');
        text = previous.slice(0, index) + data.replace + previous.slice(index + data.find.length);
      }
    }
    if (Buffer.byteLength(text) > 256 * 1024) throw Error('File text exceeds 256 KiB.');
    write(file, text, mode, data.live && !data.expectedSha256); result = { path: data.path, bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex') };
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
class WorkspaceTools {
  constructor(protected readonly sandbox = new CommandSandbox()) {}
  protected async file(
    workspace: SeatWorkspace,
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
    live = false,
  ) {
    const payload: Record<string, unknown> = {
      root: workspace.root,
      live,
      privateRoots: live ? privateProjectRoots() : [],
      protectedPart: LIVE_PROTECTED_PART,
      protectedSuffix: LIVE_PROTECTED_SUFFIX,
      action: name,
      path: input.path === undefined ? '.' : relativePath(text(input, 'path')),
    };
    if (
      ['read_file', 'write_file', 'patch_file', 'publish_artifact'].includes(name) &&
      input.path === undefined
    )
      throw new Error('Provide a file path.');
    if (name === 'search_files') {
      payload.query = text(input, 'query', 1000);
      if (!payload.query) throw new Error('Provide a non-empty search query.');
    }
    if (name === 'write_file') {
      payload.text = text(input, 'text', 256 * 1024);
    }
    if (name === 'write_file' || (live && name === 'patch_file')) {
      if (input.expectedSha256 !== undefined || (live && name === 'patch_file')) {
        const hash = text(input, 'expectedSha256');
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Provide a valid expectedSha256.');
        payload.expectedSha256 = hash;
      }
    }
    if (name === 'patch_file') {
      payload.find = text(input, 'find', 256 * 1024);
      payload.replace = text(input, 'replace', 256 * 1024);
      if (!payload.find) throw new Error('Patch context cannot be empty.');
    }
    const result = await this.sandbox.run({
      workspace,
      live: live ? 'files' : undefined,
      argv: [process.execPath, '--input-type=commonjs', '-e', FILE_WORKER],
      cwd: workspace.root,
      stdin: JSON.stringify(payload),
      signal: signal,
      timeoutMs: 10_000,
      maxOutputBytes: name === 'publish_artifact' ? 15 * 1024 * 1024 : 2 * 1024 * 1024,
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
    return response.result;
  }
  protected async command(
    workspace: SeatWorkspace,
    input: Record<string, unknown>,
    signal?: AbortSignal,
    live?: 'command' | 'shell',
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
    return JSON.stringify(
      await this.sandbox.run({
        workspace,
        argv,
        cwd,
        timeoutMs,
        signal,
        live,
        includeDependencies: input.includeDependencies !== false,
      }),
    );
  }
}

export class ToolBroker extends WorkspaceTools {
  private readonly pending = new Map<string, Promise<void>>();
  constructor(
    private readonly manager: WorkspaceManager,
    sandbox = new CommandSandbox(),
  ) {
    super(sandbox);
  }
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
    if (request.name === 'publish_text_artifact') {
      const path = relativePath(text(request.input, 'path'));
      const content = text(request.input, 'text', 256 * 1024);
      if (!content.trim()) throw new Error('Provide non-empty artifact text.');
      if (Buffer.byteLength(content) > 256 * 1024)
        throw new Error('Artifact text exceeds 256 KiB.');
      const title =
        request.input.title === undefined ? undefined : text(request.input, 'title', 200);
      return JSON.stringify(
        this.manager.publish({
          workspace,
          turnId: request.turnId,
          path,
          title,
          content: Buffer.from(content),
        }),
      );
    }
    const result = await this.file(workspace, request.name, request.input, request.signal);
    if (request.name === 'publish_artifact') {
      if (typeof result.content !== 'string')
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
          content: Buffer.from(result.content, 'base64'),
        }),
      );
    }
    return JSON.stringify(result);
  }
}

const liveNames: Record<string, string> = {
  project_list: 'list_workspace',
  project_read: 'read_file',
  project_search: 'search_files',
  project_write: 'write_file',
  project_patch: 'patch_file',
  project_run: 'run_command',
  project_shell: 'run_command',
};
const liveDescriptions: Record<string, string> = {
  project_list: 'List entries in the shared project directory.',
  project_read: 'Read a UTF-8 project file (up to 256 KiB), including its sha256 for edits.',
  project_search: 'Search the project for literal text. Results are bounded.',
  project_write:
    'Create a new UTF-8 file, or replace an existing file using its most recent expectedSha256 from project_read.',
  project_patch:
    'Replace one exact unique occurrence in a UTF-8 file. Provide expectedSha256 from project_read.',
  project_shell:
    'Run a /bin/sh command in the attached checkout. Writes persist. Network and local services are available. cwd is relative to the project root.',
  project_run:
    'Run argv on a disposable project copy with temp/cache output. No source changes are retained. Protected paths, hardlinks and network are unavailable.',
};
export class LiveProjectTools extends WorkspaceTools {
  private readonly pending = new Map<string, Promise<void>>();
  definitions(): BrokerToolDefinition[] {
    return Object.entries(liveNames).map(([name, source]) => {
      const entry = structuredClone(definitions.find((definition) => definition.name === source)!);
      if (name === 'project_shell') {
        const { cwd, timeoutMs } = entry.inputSchema.properties as Record<string, unknown>;
        entry.inputSchema = schema({ command: { type: 'string' }, cwd, timeoutMs }, ['command']);
      }
      if (name === 'project_run')
        entry.inputSchema = schema(
          {
            ...(entry.inputSchema.properties as Record<string, unknown>),
            includeDependencies: {
              type: 'boolean',
              description:
                'Include installed node_modules (default true). Use false for faster checks that only need the runtime.',
            },
          },
          ['argv'],
        );
      if (name === 'project_patch')
        entry.inputSchema = schema(
          {
            ...(entry.inputSchema.properties as Record<string, unknown>),
            expectedSha256: { type: 'string' },
          },
          ['path', 'find', 'replace', 'expectedSha256'],
        );
      return { ...entry, name, description: liveDescriptions[name]! };
    });
  }
  async call(
    root: string,
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<string> {
    signal?.throwIfAborted();
    const definition = this.definitions().find((def) => def.name === name);
    if (!definition) throw new Error('Unknown project tool.');
    const fields = definition.inputSchema.properties;
    if (!object(fields) || Object.keys(input).some((key) => !Object.hasOwn(fields, key)))
      throw new Error('Tool input contains unsupported fields.');
    if (typeof input.cwd === 'string' && protectedProjectPath(input.cwd))
      throw new Error('Protected project directory.');
    const canonical = realpathSync(root);
    if (canonical !== root) throw new Error('The attached project path changed.');
    const identity = statSync(root);
    if (
      privateProjectRoots().some((path) => containsPath(path, root)) ||
      protectedProjectPath(root)
    )
      throw new Error('Protected project directory.');
    if (input.includeDependencies !== undefined && typeof input.includeDependencies !== 'boolean')
      throw new Error('includeDependencies must be boolean.');
    const workspace: SeatWorkspace = {
      runId: '',
      seat: 'a',
      source: null,
      root: canonical,
      readOnlyRoots: [],
    };
    const operation = liveNames[name]!;
    if (name === 'project_run') return this.command(workspace, input, signal, 'command');
    const execute = async () => {
      signal?.throwIfAborted();
      const now = statSync(root);
      if (realpathSync(root) !== canonical || now.dev !== identity.dev || now.ino !== identity.ino)
        throw new Error('The attached project path changed.');
      if (name === 'project_shell') {
        const command = text(input, 'command');
        if (!command.trim()) throw new Error('Provide a non-empty shell command.');
        return this.command(
          workspace,
          { ...input, argv: ['/bin/sh', '-c', command] },
          signal,
          'shell',
        );
      }
      return JSON.stringify(await this.file(workspace, operation, input, signal, true));
    };
    if (name !== 'project_write' && name !== 'project_patch' && name !== 'project_shell')
      return execute();
    const result = (this.pending.get(canonical) ?? Promise.resolve()).then(execute);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.pending.set(canonical, tail);
    try {
      return await result;
    } finally {
      if (this.pending.get(canonical) === tail) this.pending.delete(canonical);
    }
  }
}
