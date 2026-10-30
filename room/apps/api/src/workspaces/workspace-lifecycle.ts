import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { WorkspaceManager, type WorkspaceSeat } from './workspace-manager.js';

const execute = promisify(execFile);
export interface PreservedResult {
  runId: string;
  seat: WorkspaceSeat;
  path: string;
  digest: string;
  excluded: string[];
  preservedAt: number;
  remote?: string;
  cleanedAt?: number;
}
const scanner = String.raw`
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [source,target]=process.argv.slice(1);const files=[],excluded=[];
function visit(root,rel='') {for(const name of fs.readdirSync(root).sort()){
 const next=path.join(root,name),key=rel?rel+'/'+name:name;
 if(['.git','.tool-home','.tool-tmp','node_modules','.ssh','.aws','.codex'].includes(name)||name.startsWith('.env')){excluded.push(key);continue;}
 const stat=fs.lstatSync(next);if(stat.isSymbolicLink())throw Error('Symbolic links are unavailable: '+key);
 if(stat.isDirectory()){if(target)fs.mkdirSync(path.join(target,key),{recursive:true});visit(next,key);}
 else if(stat.isFile()){if(stat.size>50*1024*1024)throw Error('File exceeds 50 MiB: '+key);
 const fd=fs.openSync(next,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let data;try{data=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 files.push([key,crypto.createHash('sha256').update(data).digest('hex'),stat.mode&0o111?1:0]);
 if(target)fs.writeFileSync(path.join(target,key),data,{mode:stat.mode&0o111?0o755:0o644});}
 else throw Error('Unsupported file type: '+key);
}}
visit(source);process.stdout.write(JSON.stringify({digest:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),excluded}));`;
function atomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}
async function command(binary: string, args: string[], cwd?: string) {
  return (
    await execute(binary, args, {
      cwd,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GH_TOKEN: process.env.GH_TOKEN,
        GH_HOST: 'github.com',
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'core.hooksPath',
        GIT_CONFIG_VALUE_0: '/dev/null',
        GIT_CONFIG_KEY_1: 'core.fsmonitor',
        GIT_CONFIG_VALUE_1: 'false',
      },
    })
  ).stdout.trim();
}
async function scan(
  source: string,
  target?: string,
): Promise<{ digest: string; excluded: string[] }> {
  if (process.platform !== 'darwin')
    throw new Error('Contained result preservation requires macOS.');
  const canonical = realpathSync(source);
  const executable = realpathSync(process.execPath);
  const reads = [
    canonical,
    dirname(executable),
    '/dev',
    '/System',
    '/usr',
    '/bin',
    '/private/var/db',
    '/private/etc',
    '/Library',
    '/opt/homebrew',
  ];
  const parents = new Set<string>();
  for (const root of reads) {
    let parent = dirname(root);
    while (!parents.has(parent)) {
      parents.add(parent);
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }
  const profile = `(version 1)(allow default)(deny network*)(deny file-read-data (require-not (require-any ${reads.map((p) => `(subpath ${JSON.stringify(p)})`).join(' ')} ${[...parents].map((p) => `(literal ${JSON.stringify(p)})`).join(' ')})))(deny file-write* (require-not (require-any (literal "/dev/null") ${target ? `(subpath ${JSON.stringify(realpathSync(target))})` : ''})))`;
  const output = await command('/usr/bin/sandbox-exec', [
    '-p',
    profile,
    executable,
    '-e',
    scanner,
    canonical,
    ...(target ? [realpathSync(target)] : []),
  ]);
  const value: unknown = JSON.parse(output);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('digest' in value) ||
    typeof value.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    !('excluded' in value) ||
    !Array.isArray(value.excluded) ||
    !value.excluded.every((item) => typeof item === 'string')
  )
    throw new Error('Invalid result manifest.');
  return { digest: value.digest, excluded: value.excluded };
}
const operations = new WeakMap<WorkspaceManager, Set<string>>();
export class WorkspaceLifecycle {
  private get pending() {
    let value = operations.get(this.manager);
    if (!value) {
      value = new Set<string>();
      operations.set(this.manager, value);
    }
    return value;
  }
  constructor(
    private readonly manager: WorkspaceManager,
    private readonly publishCommand = command,
  ) {}
  private identity(runId: string, seat: WorkspaceSeat) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(runId) || !['a', 'b'].includes(seat))
      throw new Error('Invalid workspace identity.');
    return `${runId}-${seat}`;
  }
  private resultRoot(runId: string) {
    const manifest = this.manager.get(runId);
    const project = manifest?.projectDirectory;
    if (!project) return join(this.manager.managedRoot, 'results', runId);
    if (realpathSync(project) !== project) throw new Error('Project folder changed.');
    const parent = join(project, 'lilbits');
    const root = join(parent, manifest?.resultNames?.run ?? runId);
    for (const path of [parent, root]) {
      if (
        existsSync(path) &&
        (lstatSync(path).isSymbolicLink() ||
          !lstatSync(path).isDirectory() ||
          realpathSync(path) !== path)
      )
        throw new Error('Result directory changed.');
    }
    return root;
  }
  private resultSeatName(runId: string, seat: WorkspaceSeat) {
    return this.manager.get(runId)?.resultNames?.[seat] ?? seat;
  }
  private ensureResultRoot(runId: string) {
    const project = this.manager.get(runId)?.projectDirectory;
    const root = this.resultRoot(runId);
    if (!project) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
    } else {
      if (realpathSync(project) !== project) throw new Error('Project folder changed.');
      for (const path of [join(project, 'lilbits'), root]) {
        if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
        if (
          lstatSync(path).isSymbolicLink() ||
          !lstatSync(path).isDirectory() ||
          realpathSync(path) !== path
        )
          throw new Error('Result directory changed.');
      }
    }
    return root;
  }
  private metadata(runId: string, seat: WorkspaceSeat) {
    this.identity(runId, seat);
    return join(this.manager.controlRoot, 'results', runId, `${seat}.json`);
  }
  result(runId: string, seat: WorkspaceSeat): PreservedResult | null {
    const path = this.metadata(runId, seat);
    if (!existsSync(path)) return null;
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const root = this.resultRoot(runId);
    const seatName = this.resultSeatName(runId, seat);
    const validPath = (resultPath: string) =>
      dirname(resultPath) === root &&
      (basename(resultPath) === seatName ||
        new RegExp(`^${seatName}-[a-f0-9-]{36}$`).test(basename(resultPath)));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('runId' in value) ||
      value.runId !== runId ||
      !('seat' in value) ||
      value.seat !== seat ||
      !('path' in value) ||
      typeof value.path !== 'string' ||
      !validPath(value.path) ||
      !('digest' in value) ||
      typeof value.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.digest) ||
      !('excluded' in value) ||
      !Array.isArray(value.excluded) ||
      !value.excluded.every((item) => typeof item === 'string') ||
      !('preservedAt' in value) ||
      typeof value.preservedAt !== 'number'
    )
      throw new Error('Invalid preserved result.');
    return {
      runId,
      seat,
      path: value.path,
      digest: value.digest,
      excluded: value.excluded,
      preservedAt: value.preservedAt,
      ...('remote' in value && typeof value.remote === 'string' ? { remote: value.remote } : {}),
      ...('cleanedAt' in value && typeof value.cleanedAt === 'number'
        ? { cleanedAt: value.cleanedAt }
        : {}),
    };
  }
  private revisionMetadata(result: PreservedResult) {
    const metadata = this.metadata(result.runId, result.seat);
    const revision = basename(result.path);
    return revision === this.resultSeatName(result.runId, result.seat)
      ? metadata
      : `${metadata}.${revision}`;
  }
  private retained(runId: string, seat: WorkspaceSeat) {
    if (this.manager.get(runId)?.state !== 'retained')
      throw new Error('Complete or stop this run before preserving its work.');
    return this.manager.workspace(runId, seat);
  }
  async preserve(runId: string, seat: WorkspaceSeat): Promise<PreservedResult> {
    const key = this.identity(runId, seat);
    if (this.pending.has(key)) throw new Error('A result operation is already in progress.');
    this.pending.add(key);
    try {
      const pendingPath = `${this.metadata(runId, seat)}.pending`;
      if (existsSync(pendingPath)) {
        const staging = readFileSync(pendingPath, 'utf8');
        const root = this.resultRoot(runId);
        const name = basename(staging);
        const seatName = this.resultSeatName(runId, seat);
        if (
          dirname(staging) !== root ||
          !(
            name === `${seatName}.staging` ||
            new RegExp(`^${seatName}-[a-f0-9-]{36}\\.staging$`).test(name)
          )
        )
          throw new Error('Invalid result staging directory.');
        const path = staging.slice(0, -'.staging'.length);
        const recovery = `${pendingPath}.result`;
        if (existsSync(path)) {
          if (!existsSync(recovery)) throw new Error('Unowned result destination.');
          const pending: unknown = JSON.parse(readFileSync(recovery, 'utf8'));
          if (
            typeof pending !== 'object' ||
            pending === null ||
            !('path' in pending) ||
            pending.path !== path ||
            !('digest' in pending) ||
            pending.digest !== (await scan(path)).digest
          )
            throw new Error('Interrupted result cannot be verified.');
          const current = this.result(runId, seat);
          if (!current || current.path !== path || current.digest !== pending.digest) {
            atomic(this.metadata(runId, seat), pending);
            if (!this.result(runId, seat)) throw new Error('Result recovery failed.');
          }
        } else if (existsSync(staging)) {
          rmSync(staging, { recursive: true });
        }
        rmSync(recovery, { force: true });
        rmSync(pendingPath, { force: true });
      }
      const existing = this.result(runId, seat);
      if (existing && (await scan(existing.path)).digest !== existing.digest)
        throw new Error('The preserved result was modified.');
      if (existing?.cleanedAt) return existing;
      const source = this.retained(runId, seat);
      if (existing && (await scan(source.root)).digest === existing.digest) return existing;
      if (existing) atomic(`${this.revisionMetadata(existing)}.snapshot`, existing);
      const seatName = this.resultSeatName(runId, seat);
      const name = existing ? `${seatName}-${randomUUID()}` : seatName;
      const path = join(this.ensureResultRoot(runId), name);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      if (realpathSync(dirname(path)) !== dirname(path)) throw new Error('Result parent changed.');
      const staging = `${path}.staging`;
      if (existsSync(path) || existsSync(staging)) throw new Error('Unowned result destination.');
      mkdirSync(dirname(pendingPath), { recursive: true, mode: 0o700 });
      writeFileSync(pendingPath, staging, { mode: 0o600 });
      mkdirSync(staging, { mode: 0o700 });
      const before = await scan(source.root);
      const copied = await scan(source.root, staging);
      const after = await scan(source.root);
      if (before.digest !== copied.digest || after.digest !== copied.digest)
        throw new Error('Workspace changed while preserving. Stop writers and retry.');
      await command('git', ['init', '--initial-branch=main', staging]);
      await command('git', ['add', '--force', '--all'], staging);
      await command(
        'git',
        [
          '-c',
          'user.name=Maestro',
          '-c',
          'user.email=maestro@localhost',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '--allow-empty',
          '-m',
          'Preserved prototype',
        ],
        staging,
      );
      const commit = await command('git', ['rev-parse', 'HEAD'], staging);
      const result: PreservedResult = { runId, seat, path, ...copied, preservedAt: Date.now() };
      writeFileSync(`${this.revisionMetadata(result)}.commit`, commit, { mode: 0o600 });
      atomic(`${pendingPath}.result`, result);
      renameSync(staging, path);
      atomic(this.metadata(runId, seat), result);
      rmSync(`${pendingPath}.result`, { force: true });
      rmSync(pendingPath, { force: true });
      return result;
    } finally {
      this.pending.delete(key);
    }
  }
  private async confirmed(runId: string, seat: WorkspaceSeat, digest: string) {
    const result = this.result(runId, seat);
    if (!result || result.digest !== digest || (await scan(result.path)).digest !== digest)
      throw new Error('Review the current preserved result before continuing.');
    return result;
  }
  async cleanup(input: { runId: string; seat: WorkspaceSeat; digest: string }) {
    const key = this.identity(input.runId, input.seat);
    if (this.pending.has(key)) throw new Error('A result operation is already in progress.');
    this.pending.add(key);
    try {
      return await this.cleanupResult(input);
    } finally {
      this.pending.delete(key);
    }
  }
  private async cleanupResult(input: { runId: string; seat: WorkspaceSeat; digest: string }) {
    const result = await this.confirmed(input.runId, input.seat, input.digest);
    if (result.cleanedAt) return result;
    const cleanupMarker = `${this.metadata(input.runId, input.seat)}.cleanup`;
    const owned = this.manager.get(input.runId)?.seats[input.seat];
    if (
      owned &&
      !existsSync(owned.root) &&
      existsSync(cleanupMarker) &&
      readFileSync(cleanupMarker, 'utf8') === result.digest
    ) {
      const recovered = { ...result, cleanedAt: Date.now() };
      atomic(this.metadata(input.runId, input.seat), recovered);
      return recovered;
    }
    const source = this.retained(input.runId, input.seat);
    const current = await scan(source.root);
    if (
      current.excluded.some(
        (path) =>
          path.split('/').at(-1)?.startsWith('.env') ||
          ['.ssh', '.aws', '.codex'].includes(path.split('/').at(-1) ?? ''),
      )
    )
      throw new Error(
        'Excluded private files remain in the workspace. Move them to a safe location before cleanup.',
      );
    if (current.digest !== input.digest)
      throw new Error(
        'Workspace changed after preservation. Keep it and preserve the new work first.',
      );
    writeFileSync(cleanupMarker, result.digest, { mode: 0o600 });
    await this.manager.removePreserved(input.runId, input.seat);
    const completed = { ...result, cleanedAt: Date.now() };
    atomic(this.metadata(input.runId, input.seat), completed);
    return completed;
  }
  async publishPrivate(input: {
    runId: string;
    seat: WorkspaceSeat;
    digest: string;
    name: string;
  }) {
    const key = this.identity(input.runId, input.seat);
    if (this.pending.has(key)) throw new Error('A result operation is already in progress.');
    this.pending.add(key);
    try {
      return await this.publishResult(input);
    } finally {
      this.pending.delete(key);
    }
  }
  private async publishResult(input: {
    runId: string;
    seat: WorkspaceSeat;
    digest: string;
    name: string;
  }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(input.name))
      throw new Error('Choose a valid GitHub repository name.');
    const result = await this.confirmed(input.runId, input.seat, input.digest);
    if (result.remote) return result;
    const expectedCommit = readFileSync(`${this.revisionMetadata(result)}.commit`, 'utf8');
    if (
      !/^[a-f0-9]{40,64}$/.test(expectedCommit) ||
      (await this.publishCommand('git', ['rev-parse', 'HEAD'], result.path)) !== expectedCommit
    )
      throw new Error('The preserved Git history changed.');
    const login = await this.publishCommand('gh', ['api', 'user', '--jq', '.login']);
    if (!/^[a-zA-Z0-9-]+$/.test(login)) throw new Error('GitHub account unavailable.');
    const name = `${login}/${input.name}`;
    let info: { private?: boolean; html_url?: string; description?: string };
    const marker = `${this.revisionMetadata(result)}.remote`;
    if (existsSync(marker) && readFileSync(marker, 'utf8') !== name)
      throw new Error('This result already has another publishing destination.');
    const tokenPath = `${marker}.token`;
    if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomUUID(), { mode: 0o600 });
    const description = `Maestro preserved result ${readFileSync(tokenPath, 'utf8')}`;
    const hadIntent = existsSync(marker);
    let existed = false;
    try {
      info = JSON.parse(await this.publishCommand('gh', ['api', `repos/${name}`]));
      existed = true;
    } catch {
      writeFileSync(marker, name, { mode: 0o600 });
      info = JSON.parse(
        await this.publishCommand('gh', [
          'api',
          'user/repos',
          '-f',
          `name=${input.name}`,
          '-F',
          'private=true',
          '-f',
          `description=${description}`,
        ]),
      );
    }
    if (info.description !== description)
      throw new Error(
        'The repository does not belong to this publishing request. Choose a new name.',
      );
    if (!info.private || !info.html_url)
      throw new Error('The destination is not a private GitHub repository.');
    if (existed && !hadIntent)
      throw new Error('That repository already exists. Choose a new name.');
    if (existsSync(marker) && readFileSync(marker, 'utf8') !== name)
      throw new Error('This result already has another publishing destination.');
    const branches: unknown = JSON.parse(
      await this.publishCommand('gh', ['api', `repos/${name}/branches`]),
    );
    if (!Array.isArray(branches)) throw new Error('Invalid GitHub branches response.');
    if (branches.length) {
      const remoteHead = await this.publishCommand('gh', [
        'api',
        `repos/${name}/git/ref/heads/main`,
        '--jq',
        '.object.sha',
      ]);
      if (branches.length !== 1 || remoteHead !== expectedCommit)
        throw new Error('The destination contains other work. Choose another name.');
    }
    await this.publishCommand(
      'git',
      [
        '-c',
        'credential.helper=',
        '-c',
        'credential.helper=!gh auth git-credential',
        'push',
        `https://github.com/${name}.git`,
        `${expectedCommit}:refs/heads/main`,
      ],
      result.path,
    );
    const local = await this.publishCommand('git', ['rev-parse', 'HEAD'], result.path);
    const remote = await this.publishCommand('gh', [
      'api',
      `repos/${name}/git/ref/heads/main`,
      '--jq',
      '.object.sha',
    ]);
    const privateNow = await this.publishCommand('gh', [
      'api',
      `repos/${name}`,
      '--jq',
      '.private',
    ]);
    if (remote !== local || privateNow !== 'true')
      throw new Error('Private publication could not be verified.');
    const published = { ...result, remote: info.html_url };
    atomic(this.metadata(input.runId, input.seat), published);
    return published;
  }
}
