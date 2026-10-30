import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
  chmodSync,
  readdirSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { projectPath } from './project-directory.js';

export type WorkspaceSeat = 'a' | 'b';
export class WorkspaceLocationError extends Error {
  constructor() {
    super(
      'These workspaces belong to another application location. Open the original installation to manage them. Saved outputs remain available here.',
    );
  }
}
export interface WorkspaceSource {
  repository: string;
  revision: string;
}
export interface SeatWorkspace {
  runId: string;
  seat: WorkspaceSeat;
  root: string;
  source: WorkspaceSource | null;
  readOnlyRoots: string[];
}
export interface RunWorkspaces {
  version: 1;
  runId: string;
  state: 'preparing' | 'ready' | 'interrupted' | 'retained';
  source: WorkspaceSource | null;
  projectDirectory?: string;
  projectIdentity?: { dev: number; ino: number };
  resultNames?: { run: string; a: string; b: string };
  seats: Record<WorkspaceSeat, SeatWorkspace>;
  detail?: string;
  ownership?: 1;
}
export interface WorkspaceArtifact {
  id: string;
  runId: string;
  seat: WorkspaceSeat;
  turnId: string;
  path: string;
  title: string;
  sha256: string;
  mimeType: string;
  sourceRevision: string | null;
  bytes: number;
  createdAt: number;
}
export function containsPath(root: string, path: string): boolean {
  const tail = relative(root, path);
  return (
    tail === '' ||
    (!isAbsolute(tail) &&
      tail !== '..' &&
      !tail.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
  );
}
function identifier(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid run or artifact identifier.');
  return value;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function atomicJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}
const executeGit = promisify(execFile);
async function git(repository: string, args: string[]): Promise<string> {
  const { stdout } = await executeGit(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'submodule.recurse=false',
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
        GIT_NO_LAZY_FETCH: '1',
        GIT_LFS_SKIP_SMUDGE: '1',
        LANG: 'C',
      },
    },
  );
  return stdout.trim();
}

async function assertNoCheckoutFilters(repository: string): Promise<void> {
  try {
    const filters = await git(repository, [
      'config',
      '--get-regexp',
      '^filter[.].*[.](smudge|process)$',
    ]);
    if (filters) throw new Error('Repository checkout filters are unavailable in isolated runs.');
  } catch (error) {
    if (!record(error) || error.code !== 1) throw error;
  }
}

export class WorkspaceManager {
  readonly controlRoot: string;
  readonly managedRoot: string;
  private readonly readOnlyRoots: string[];
  private readonly preparing = new Map<
    string,
    { source: string; result: Promise<RunWorkspaces> }
  >();
  constructor(options: { controlRoot: string; managedRoot?: string; readOnlyRoots?: string[] }) {
    mkdirSync(options.controlRoot, { recursive: true, mode: 0o700 });
    this.controlRoot = realpathSync(options.controlRoot);
    if (options.managedRoot) {
      mkdirSync(options.managedRoot, { recursive: true, mode: 0o700 });
      this.managedRoot = realpathSync(options.managedRoot);
      if (
        containsPath(this.controlRoot, this.managedRoot) ||
        containsPath(this.managedRoot, this.controlRoot)
      )
        throw new Error('Managed workspaces must be separate from private control state.');
    } else {
      this.managedRoot = join(this.controlRoot, 'workspaces');
    }
    this.readOnlyRoots = (options.readOnlyRoots ?? []).map((path) => realpathSync(path));
    if (
      this.readOnlyRoots.some(
        (path) =>
          containsPath(path, this.controlRoot) ||
          containsPath(this.controlRoot, path) ||
          containsPath(path, this.managedRoot) ||
          containsPath(this.managedRoot, path),
      )
    )
      throw new Error('Dependency roots cannot expose the control directory.');
  }
  private manifestPath(runId: string) {
    return join(this.controlRoot, 'runs', identifier(runId), 'workspaces.json');
  }
  private workspaceRoot(runId: string, seat: WorkspaceSeat) {
    return join(this.managedRoot, identifier(runId), seat);
  }
  private ownerPath(runId: string, seat: WorkspaceSeat) {
    return join(this.controlRoot, 'runs', identifier(runId), `owner-${seat}.json`);
  }
  private assertOwner(workspace: SeatWorkspace) {
    const path = this.ownerPath(workspace.runId, workspace.seat);
    if (!existsSync(path)) throw new Error('Workspace ownership cannot be verified.');
    const owner: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const stat = lstatSync(workspace.root);
    if (
      !record(owner) ||
      owner.root !== workspace.root ||
      owner.dev !== stat.dev ||
      owner.ino !== stat.ino
    )
      throw new Error('Workspace ownership cannot be verified.');
  }
  private async assertGitOwner(workspace: SeatWorkspace, source: WorkspaceSource) {
    const common = async (path: string) =>
      realpathSync(await git(path, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    const registered = await git(source.repository, ['worktree', 'list', '--porcelain', '-z']);
    if (
      (await common(workspace.root)) !== (await common(source.repository)) ||
      (await git(workspace.root, ['symbolic-ref', 'HEAD'])) !==
        `refs/heads/room/${workspace.runId}/${workspace.seat}` ||
      !registered.split('\0').includes(`worktree ${workspace.root}`)
    )
      throw new Error('Workspace Git ownership cannot be verified.');
  }
  get(runId: string): RunWorkspaces | undefined {
    const path = this.manifestPath(runId);
    if (!existsSync(path)) return undefined;
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      !record(value) ||
      value.version !== 1 ||
      (value.ownership !== undefined && value.ownership !== 1) ||
      value.runId !== runId ||
      !record(value.seats) ||
      (value.state !== 'preparing' &&
        value.state !== 'ready' &&
        value.state !== 'interrupted' &&
        value.state !== 'retained')
    )
      throw new Error('Invalid workspace manifest.');
    if (
      value.projectDirectory !== undefined &&
      (typeof value.projectDirectory !== 'string' ||
        projectPath(value.projectDirectory) !== value.projectDirectory)
    )
      throw new Error('Invalid project directory in workspace manifest.');
    if (value.projectDirectory !== undefined) {
      if (
        !record(value.projectIdentity) ||
        typeof value.projectIdentity.dev !== 'number' ||
        typeof value.projectIdentity.ino !== 'number'
      )
        throw new Error('Invalid project ownership in workspace manifest.');
      const stat = lstatSync(value.projectDirectory as string);
      if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        stat.dev !== value.projectIdentity.dev ||
        stat.ino !== value.projectIdentity.ino
      )
        throw new Error('Project folder changed.');
    }
    if (
      value.resultNames !== undefined &&
      (!record(value.resultNames) ||
        typeof value.resultNames.run !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(value.resultNames.run) ||
        !value.resultNames.run.endsWith(`-${runId}`) ||
        typeof value.resultNames.a !== 'string' ||
        !/^a-[a-z0-9-]+$/.test(value.resultNames.a) ||
        typeof value.resultNames.b !== 'string' ||
        !/^b-[a-z0-9-]+$/.test(value.resultNames.b))
    )
      throw new Error('Invalid result names in workspace manifest.');
    const entries = value.seats;
    const source = this.parseSource(value.source);
    const legacyRoot = join(this.controlRoot, 'workspaces', identifier(runId));
    const configuredRoot = join(this.managedRoot, identifier(runId));
    const base =
      record(entries.a) && entries.a.root === join(legacyRoot, 'a') ? legacyRoot : configuredRoot;
    if (
      record(entries.a) &&
      record(entries.b) &&
      typeof entries.a.root === 'string' &&
      typeof entries.b.root === 'string' &&
      isAbsolute(entries.a.root) &&
      normalize(entries.a.root) === entries.a.root &&
      basename(dirname(entries.a.root)) === runId &&
      entries.a.root === join(dirname(entries.a.root), 'a') &&
      entries.b.root === join(dirname(entries.a.root), 'b') &&
      entries.a.root !== join(base, 'a')
    )
      throw new WorkspaceLocationError();
    const readSeat = (seat: WorkspaceSeat): SeatWorkspace => {
      const entry = entries[seat];
      if (!record(entry) || entry.root !== join(base, seat))
        throw new Error('Workspace manifest root does not match its owner.');
      return { runId, seat, root: entry.root, source, readOnlyRoots: [...this.readOnlyRoots] };
    };
    const seats = { a: readSeat('a'), b: readSeat('b') };
    return {
      version: 1,
      runId,
      state: value.state,
      source: this.parseSource(value.source),
      ...(typeof value.projectDirectory === 'string' &&
      record(value.projectIdentity) &&
      typeof value.projectIdentity.dev === 'number' &&
      typeof value.projectIdentity.ino === 'number'
        ? {
            projectDirectory: value.projectDirectory,
            projectIdentity: { dev: value.projectIdentity.dev, ino: value.projectIdentity.ino },
          }
        : {}),
      ...(record(value.resultNames) &&
      typeof value.resultNames.run === 'string' &&
      typeof value.resultNames.a === 'string' &&
      typeof value.resultNames.b === 'string'
        ? {
            resultNames: {
              run: value.resultNames.run,
              a: value.resultNames.a,
              b: value.resultNames.b,
            },
          }
        : {}),
      seats,
      ...(value.ownership === 1 ? { ownership: 1 as const } : {}),
      ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
    };
  }
  private parseSource(value: unknown): WorkspaceSource | null {
    if (value === null) return null;
    if (
      !record(value) ||
      typeof value.repository !== 'string' ||
      typeof value.revision !== 'string' ||
      !/^[a-f0-9]{40,64}$/.test(value.revision)
    )
      throw new Error('Invalid workspace source.');
    return { repository: value.repository, revision: value.revision };
  }
  async provision(input: {
    runId: string;
    source?: WorkspaceSource;
    projectDirectory?: string;
    resultNames?: { run: string; a: string; b: string };
  }): Promise<RunWorkspaces> {
    const runId = identifier(input.runId);
    const source = JSON.stringify([
      input.source ?? null,
      input.projectDirectory ?? null,
      input.resultNames ?? null,
    ]);
    const pending = this.preparing.get(runId);
    if (pending) {
      if (pending.source !== source)
        throw new Error('This run is preparing a different workspace source.');
      return pending.result;
    }
    const result = this.prepare(input);
    this.preparing.set(runId, { source, result });
    try {
      return await result;
    } finally {
      if (this.preparing.get(runId)?.result === result) this.preparing.delete(runId);
    }
  }
  private async prepare(input: {
    runId: string;
    source?: WorkspaceSource;
    projectDirectory?: string;
    resultNames?: { run: string; a: string; b: string };
  }): Promise<RunWorkspaces> {
    const runId = identifier(input.runId);
    let source: WorkspaceSource | null = null;
    if (input.source) {
      if (!/^[a-f0-9]{40,64}$/.test(input.source.revision))
        throw new Error('Choose an immutable source commit.');
      const repository = realpathSync(
        await git(realpathSync(input.source.repository), ['rev-parse', '--show-toplevel']),
      );
      const revision = await git(repository, [
        'rev-parse',
        '--verify',
        `${input.source.revision}^{commit}`,
      ]);
      await assertNoCheckoutFilters(repository);
      source = { repository, revision };
      if (containsPath(repository, this.controlRoot))
        throw new Error('Control state must stay outside the source repository.');
    }
    const projectDirectory = input.projectDirectory
      ? realpathSync(projectPath(input.projectDirectory))
      : undefined;
    if (
      projectDirectory &&
      (containsPath(projectDirectory, this.controlRoot) ||
        containsPath(this.controlRoot, projectDirectory))
    )
      throw new Error('Project and private control directories overlap.');
    const previous = this.get(runId);
    if (previous && previous.projectDirectory !== projectDirectory)
      throw new Error('This run already has a different project directory.');
    if (previous && JSON.stringify(previous.resultNames) !== JSON.stringify(input.resultNames))
      throw new Error('The task or models changed after preparation. Create a new run.');
    if (previous && JSON.stringify(previous.source) !== JSON.stringify(source))
      throw new Error('This run already has a different workspace source.');
    if (previous?.state === 'ready' || previous?.state === 'retained') {
      for (const seat of ['a', 'b'] as const) {
        this.assertRoot(previous.seats[seat]);
        if (previous.ownership === 1) this.assertOwner(previous.seats[seat]);
        else if (!containsPath(join(this.controlRoot, 'workspaces'), previous.seats[seat].root))
          throw new Error('Legacy workspace ownership cannot be verified.');
        if (source) await this.assertGitOwner(previous.seats[seat], source);
      }
      return previous;
    }
    const createSeat = (seat: WorkspaceSeat): SeatWorkspace => ({
      runId,
      seat,
      root: this.workspaceRoot(runId, seat),
      source,
      readOnlyRoots: [...this.readOnlyRoots],
    });
    const seats = previous?.seats ?? { a: createSeat('a'), b: createSeat('b') };
    if (previous && previous.ownership !== 1)
      throw new Error('Interrupted legacy workspace ownership cannot be verified.');
    const manifest: RunWorkspaces = {
      version: 1,
      runId,
      state: 'preparing',
      source,
      ...(input.resultNames ? { resultNames: input.resultNames } : {}),
      ...(projectDirectory
        ? {
            projectDirectory,
            projectIdentity: {
              dev: lstatSync(projectDirectory).dev,
              ino: lstatSync(projectDirectory).ino,
            },
          }
        : {}),
      seats,
      ownership: 1,
    };
    atomicJson(this.manifestPath(runId), manifest);
    try {
      for (const seat of ['a', 'b'] as const) {
        const workspace = seats[seat];
        mkdirSync(dirname(workspace.root), { recursive: true, mode: 0o700 });
        if (realpathSync(dirname(workspace.root)) !== dirname(workspace.root))
          throw new Error('Workspace parent changed.');
        if (!existsSync(workspace.root)) {
          mkdirSync(workspace.root, { mode: 0o700 });
          const stat = lstatSync(workspace.root);
          atomicJson(this.ownerPath(runId, seat), {
            root: workspace.root,
            dev: stat.dev,
            ino: stat.ino,
          });
        } else {
          this.assertOwner(workspace);
        }
        if (source) {
          if (readdirSync(workspace.root).length === 0) {
            await git(source.repository, [
              'worktree',
              'add',
              '-b',
              `room/${runId}/${seat}`,
              workspace.root,
              source.revision,
            ]);
          } else {
            if (
              lstatSync(workspace.root).isSymbolicLink() ||
              (await git(workspace.root, ['rev-parse', '--show-toplevel'])) !== workspace.root ||
              (await git(workspace.root, ['rev-parse', 'HEAD'])) !== source.revision
            )
              throw new Error('An existing workspace does not match this run source.');
          }
          await this.assertGitOwner(workspace, source);
        }
        this.assertRoot(workspace);
        for (const directory of ['.tool-home', '.tool-tmp'])
          mkdirSync(join(workspace.root, directory), { recursive: true, mode: 0o700 });
      }
      manifest.state = 'ready';
      atomicJson(this.manifestPath(runId), manifest);
      return manifest;
    } catch (error) {
      manifest.state = 'interrupted';
      manifest.detail = error instanceof Error ? error.message : 'Workspace preparation failed.';
      atomicJson(this.manifestPath(runId), manifest);
      throw error;
    }
  }
  workspace(runId: string, seat: WorkspaceSeat): SeatWorkspace {
    const run = this.get(runId);
    if (!run || (run.state !== 'ready' && run.state !== 'retained'))
      throw new Error('Run workspaces are not ready.');
    const workspace = run.seats[seat];
    this.assertRoot(workspace);
    if (run.ownership === 1) this.assertOwner(workspace);
    else if (!containsPath(join(this.controlRoot, 'workspaces'), workspace.root))
      throw new Error('Legacy workspace ownership cannot be verified.');
    return workspace;
  }
  private assertRoot(workspace: SeatWorkspace) {
    if (
      !lstatSync(workspace.root).isDirectory() ||
      lstatSync(workspace.root).isSymbolicLink() ||
      realpathSync(workspace.root) !== workspace.root
    )
      throw new Error('Workspace root changed.');
  }
  retain(runId: string): RunWorkspaces {
    const run = this.get(runId);
    if (!run) throw new Error('Unknown workspace run.');
    run.state = 'retained';
    atomicJson(this.manifestPath(runId), run);
    return run;
  }
  async removePreserved(runId: string, seat: WorkspaceSeat): Promise<void> {
    const run = this.get(runId);
    if (!run || run.state !== 'retained' || run.ownership !== 1)
      throw new Error('Only retained, application-owned workspaces can be removed.');
    const workspace = this.workspace(runId, seat);
    this.assertOwner(workspace);
    if (workspace.source) {
      await this.assertGitOwner(workspace, workspace.source);
      const bundle = join(this.controlRoot, 'results', runId, `${seat}-history.bundle`);
      mkdirSync(dirname(bundle), { recursive: true, mode: 0o700 });
      await git(workspace.root, ['bundle', 'create', bundle, 'HEAD']);
      await git(workspace.root, ['bundle', 'verify', bundle]);
      await git(workspace.source.repository, ['worktree', 'remove', '--force', workspace.root]);
    } else {
      const { rmSync } = await import('node:fs');
      rmSync(workspace.root, { recursive: true });
    }
  }
  publish(input: {
    workspace: SeatWorkspace;
    turnId: string;
    path: string;
    title?: string;
    content: Buffer;
  }): WorkspaceArtifact {
    const owned = this.workspace(input.workspace.runId, input.workspace.seat);
    if (input.content.length > 10 * 1024 * 1024)
      throw new Error('Artifacts are limited to 10 MiB.');
    const id = randomUUID();
    const ext = input.path.split('.').pop()?.toLowerCase();
    const mimeType =
      ext === 'html'
        ? 'text/html'
        : ext === 'json'
          ? 'application/json'
          : ext === 'svg'
            ? 'image/svg+xml'
            : ['png', 'jpg', 'jpeg', 'webp'].includes(ext ?? '')
              ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
              : 'text/plain';
    const artifact: WorkspaceArtifact = {
      id,
      runId: owned.runId,
      seat: owned.seat,
      turnId: input.turnId,
      path: input.path,
      title: input.title?.slice(0, 200) || input.path,
      sha256: createHash('sha256').update(input.content).digest('hex'),
      mimeType,
      sourceRevision: owned.source?.revision ?? null,
      bytes: input.content.length,
      createdAt: Date.now(),
    };
    const directory = join(this.controlRoot, 'artifacts', owned.runId, id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, 'content'), input.content, { mode: 0o400, flag: 'wx' });
    chmodSync(join(directory, 'content'), 0o400);
    atomicJson(join(directory, 'metadata.json'), artifact);
    return artifact;
  }
  artifacts(runId: string): WorkspaceArtifact[] {
    identifier(runId);
    const directory = join(this.controlRoot, 'artifacts', runId);
    if (!existsSync(directory)) return [];
    return readdirSync(directory).flatMap((id) => {
      const value: unknown = JSON.parse(
        readFileSync(join(directory, identifier(id), 'metadata.json'), 'utf8'),
      );
      if (
        !record(value) ||
        value.id !== id ||
        value.runId !== runId ||
        (value.seat !== 'a' && value.seat !== 'b') ||
        typeof value.sha256 !== 'string' ||
        typeof value.path !== 'string' ||
        typeof value.turnId !== 'string' ||
        typeof value.bytes !== 'number' ||
        typeof value.mimeType !== 'string' ||
        typeof value.title !== 'string' ||
        typeof value.createdAt !== 'number' ||
        (value.sourceRevision !== null && typeof value.sourceRevision !== 'string')
      )
        throw new Error('Invalid artifact metadata.');
      return [
        {
          id,
          runId,
          seat: value.seat,
          turnId: value.turnId,
          path: value.path,
          title: value.title,
          sha256: value.sha256,
          mimeType: value.mimeType,
          sourceRevision: value.sourceRevision,
          bytes: value.bytes,
          createdAt: value.createdAt,
        },
      ];
    });
  }
  artifact(input: {
    runId: string;
    artifactId: string;
    viewer: WorkspaceSeat | 'maestro' | 'user';
    allowPeerArtifacts: boolean;
  }): { metadata: WorkspaceArtifact; content: Buffer } {
    const metadata = this.artifacts(input.runId).find(
      (entry) => entry.id === identifier(input.artifactId),
    );
    if (!metadata) throw new Error('Unknown artifact.');
    if (
      input.viewer !== 'maestro' &&
      input.viewer !== 'user' &&
      input.viewer !== metadata.seat &&
      !input.allowPeerArtifacts
    )
      throw new Error('Peer artifacts are unavailable during independent work.');
    const content = readFileSync(
      join(this.controlRoot, 'artifacts', input.runId, metadata.id, 'content'),
    );
    if (createHash('sha256').update(content).digest('hex') !== metadata.sha256)
      throw new Error('Artifact snapshot failed its integrity check.');
    return { metadata, content };
  }
}
