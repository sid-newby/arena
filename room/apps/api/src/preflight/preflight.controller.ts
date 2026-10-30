import { canInitializeProject, projectPath } from '../workspaces/project-directory.js';
import { discoverScaffolds } from '../scaffolds/scaffold-discovery.controller.js';
import { scaffoldRoot, templateDigest } from '../scaffolds/scaffold-seed.js';
import { workspacePaths } from '../workspaces/workspace-paths.js';
import { BadRequestException, Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { accessSync, constants, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ChatService } from '../chat/chat.service.js';
import { object, parseTask } from '../debate/workflow.store.js';
import { parseProviderConfig } from '../runs/provider-config.js';
import {
  DEBATE_SEATS,
  type ProviderCatalog,
  type ProviderConfig,
  type SeatId,
  type TaskDraft,
} from '../runs/run.contract.js';
import { containsPath } from '../workspaces/workspace-manager.js';

const exec = promisify(execFile);
type Check = { ok: true; detail: string } | { ok: false; detail: string };
export interface PreflightResult {
  seats: Record<SeatId, Check>;
  source: Check & { repository?: string; revision?: string };
  destination: Check & { path: string };
}
type CatalogReader = (provider: ProviderConfig['provider']) => Promise<ProviderCatalog>;

function existingParent(path: string) {
  let existing = resolve(path);
  for (;;) {
    try {
      lstatSync(existing);
      return existing;
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
        throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
}

function prospectiveRealPath(path: string) {
  const absolute = resolve(path);
  const parent = existingParent(absolute);
  return resolve(realpathSync(parent), relative(parent, absolute));
}

async function git(repository: string, args: string[]) {
  const result = await exec(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', repository, ...args],
    {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 4096,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_NO_LAZY_FETCH: '1',
        LANG: 'C',
      },
    },
  );
  return result.stdout.trim();
}

export async function inspectPreflight(input: {
  task: TaskDraft;
  seats: Record<SeatId, ProviderConfig>;
  managedRoot: string;
  controlRoot: string;
  catalog: CatalogReader;
}): Promise<PreflightResult> {
  const seatCheck = async (seat: SeatId): Promise<Check> => {
    const selected = input.seats[seat];
    try {
      const catalog = await input.catalog(selected.provider);
      if (catalog.status !== 'ready')
        return { ok: false, detail: catalog.reason ?? 'Provider is unavailable.' };
      if (
        !catalog.models.some(
          (model) => model.id === selected.model && model.efforts.includes(selected.effort),
        )
      )
        return { ok: false, detail: 'The selected model or effort is unavailable.' };
      return { ok: true, detail: 'Model and effort are available.' };
    } catch {
      return { ok: false, detail: 'Could not check the provider. Check sign-in and try again.' };
    }
  };
  const [a, b] = await Promise.all(DEBATE_SEATS.map(seatCheck));
  let source: PreflightResult['source'] = { ok: true, detail: 'No source repository selected.' };
  if (input.task.source) {
    try {
      if (!isAbsolute(input.task.source.repository))
        throw new Error('Choose an absolute repository path.');
      let emptyProject = false;
      try {
        emptyProject =
          input.task.source.revision === 'HEAD' &&
          (await canInitializeProject(input.task.source.repository));
      } catch {}
      if (emptyProject) throw new Error('Initialize this empty project during preparation.');
      const repository = realpathSync(
        await git(input.task.source.repository, ['rev-parse', '--show-toplevel']),
      );
      if (repository !== realpathSync(input.task.source.repository))
        throw new Error('Choose the repository root, not a folder inside it.');
      const revision = await git(repository, [
        'rev-parse',
        '--verify',
        `${input.task.source.revision}^{commit}`,
      ]);
      if (!/^[a-f0-9]{40,64}$/.test(revision))
        throw new Error('Could not resolve the source commit.');
      if (containsPath(repository, prospectiveRealPath(input.controlRoot)))
        throw new Error('Private control state must stay outside the source repository.');
      source = {
        ok: true,
        detail: 'The source commit is available. Uncommitted changes are excluded.',
        repository,
        revision,
      };
    } catch (error) {
      let initializable = false;
      try {
        const project = projectPath(input.task.source.repository);
        if (
          input.task.source.revision === 'HEAD' &&
          !containsPath(prospectiveRealPath(project), prospectiveRealPath(input.controlRoot))
        )
          initializable = await canInitializeProject(project);
      } catch {}
      source = initializable
        ? {
            ok: true,
            detail: 'An empty project will receive an initial Git commit during preparation.',
            repository: input.task.source.repository,
          }
        : {
            ok: false,
            detail:
              error instanceof Error &&
              (error.message.startsWith('Choose ') ||
                error.message.startsWith('Private control state'))
                ? error.message
                : 'Could not resolve the repository and revision. Choose an existing Git repository or an empty folder with HEAD.',
          };
    }
  }
  if (input.task.scaffold) {
    try {
      const selected = input.task.scaffold;
      const root = scaffoldRoot();
      if (!discoverScaffolds(root).scaffolds.some((entry) => entry.id === selected.id))
        throw new Error('Selected scaffold is unavailable.');
      const digest = templateDigest(join(root, selected.id, 'template'));
      if (selected.digest && selected.digest !== digest)
        throw new Error('The scaffold changed. Choose it again.');
      source = { ok: true, detail: `Scaffold ${selected.id} is available.`, revision: digest };
    } catch (error) {
      source = {
        ok: false,
        detail: error instanceof Error ? error.message : 'Scaffold is unavailable.',
      };
    }
  }
  const path = input.task.projectDirectory
    ? input.task.projectDirectory
    : resolve(input.managedRoot);
  let destination: PreflightResult['destination'];
  try {
    if (input.task.projectDirectory) {
      projectPath(path);
      let existingRepository = false;
      try {
        existingRepository =
          realpathSync(await git(path, ['rev-parse', '--show-toplevel'])) === realpathSync(path);
        if (existingRepository) await git(path, ['rev-parse', '--verify', 'HEAD^{commit}']);
      } catch {
        existingRepository = false;
      }
      if (!existingRepository && !(await canInitializeProject(path)))
        throw new Error('Choose an empty project folder or an existing Git repository.');
    }
    const existing = existingParent(path);
    const actual = realpathSync(existing);
    if (!lstatSync(actual).isDirectory())
      throw new Error('Destination or parent is not a directory.');
    accessSync(actual, constants.W_OK | constants.X_OK);
    const control = prospectiveRealPath(input.controlRoot);
    const managed = prospectiveRealPath(path);
    if (containsPath(control, managed) || containsPath(managed, control))
      throw new Error('Workspace and private control directories overlap.');
    destination = {
      ok: true,
      path,
      detail: input.task.projectDirectory
        ? 'Project destination is accessible. Preparation initializes an empty folder if needed.'
        : 'Destination permissions appear available. Preparation will check again.',
    };
  } catch (error) {
    destination = {
      ok: false,
      path,
      detail:
        error instanceof Error &&
        (error.message.startsWith('Workspace and private') ||
          error.message.startsWith('Choose an empty'))
          ? error.message
          : 'Cannot access the destination or its parent. Check folder permissions.',
    };
  }
  return { seats: { a, b }, source, destination };
}

@Controller('runs/:runId/preflight')
export class PreflightController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}
  @Post()
  check(@Param('runId') runId: string, @Body() value: unknown) {
    this.chat.run(runId);
    if (!object(value) || !object(value.seats))
      throw new BadRequestException('Provide a task and model choices.');
    const task = parseTask(value.task);
    const seats = { a: parseProviderConfig(value.seats.a), b: parseProviderConfig(value.seats.b) };
    return inspectPreflight({
      task,
      seats,
      ...workspacePaths(),
      catalog: (provider) => this.chat.providerCatalog(provider),
    });
  }
}
