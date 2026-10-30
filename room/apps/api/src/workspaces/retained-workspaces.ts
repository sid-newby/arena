import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { WorkspaceManager, type WorkspaceSeat } from './workspace-manager.js';

export interface RetainedWorkspace {
  runId: string;
  seat: WorkspaceSeat;
  path: string;
  retainedAt: number;
  keepForNowAt: number | null;
}

export class RetainedWorkspaces {
  constructor(private readonly manager: WorkspaceManager) {}

  private markerPath(runId: string, seat: WorkspaceSeat): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(runId) || (seat !== 'a' && seat !== 'b'))
      throw new Error('Invalid workspace identity.');
    return join(this.manager.controlRoot, 'retained-decisions', runId, `${seat}.json`);
  }

  private keptAt(runId: string, seat: WorkspaceSeat): number | null {
    const path = this.markerPath(runId, seat);
    if (!existsSync(path)) return null;
    const marker: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      typeof marker !== 'object' ||
      marker === null ||
      !('keptAt' in marker) ||
      typeof marker.keptAt !== 'number' ||
      !Number.isSafeInteger(marker.keptAt) ||
      marker.keptAt < 0
    )
      throw new Error('Invalid retained workspace decision.');
    return marker.keptAt;
  }

  list(): { workspaces: RetainedWorkspace[]; unavailableRuns: string[] } {
    const runs = join(this.manager.controlRoot, 'runs');
    if (!existsSync(runs)) return { workspaces: [], unavailableRuns: [] };
    const workspaces: RetainedWorkspace[] = [];
    const unavailableRuns: string[] = [];
    for (const entry of readdirSync(runs, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.name)) continue;
      try {
        const run = this.manager.get(entry.name);
        if (!run || run.state !== 'retained') continue;
        const retainedAt = Math.floor(statSync(join(runs, entry.name, 'workspaces.json')).mtimeMs);
        const seats = (['a', 'b'] as const).map((seat) => ({
          runId: entry.name,
          seat,
          path: run.seats[seat].root,
          retainedAt,
          keepForNowAt: this.keptAt(entry.name, seat),
        }));
        workspaces.push(...seats);
      } catch {
        unavailableRuns.push(entry.name);
      }
    }
    return { workspaces, unavailableRuns };
  }

  keepForNow(runId: string, seat: WorkspaceSeat): RetainedWorkspace {
    const path = this.markerPath(runId, seat);
    const workspace = this.list().workspaces.find(
      (item) => item.runId === runId && item.seat === seat,
    );
    if (!workspace) throw new Error('Retained workspace is unavailable.');
    if (workspace.keepForNowAt !== null) return workspace;
    const keptAt = Date.now();
    mkdirSync(join(this.manager.controlRoot, 'retained-decisions', runId), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify({ keptAt }), { mode: 0o600 });
    renameSync(temporary, path);
    return { ...workspace, keepForNowAt: keptAt };
  }
}
