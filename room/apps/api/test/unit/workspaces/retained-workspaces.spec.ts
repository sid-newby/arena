import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RetainedWorkspaces } from '../../../src/workspaces/retained-workspaces.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';

it('lists retained workspaces and records keep decisions without changing workspace files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'room-retained-'));
  try {
    const manager = new WorkspaceManager({ controlRoot: join(root, 'control') });
    const run = await manager.provision({ runId: 'run-one' });
    const path = join(run.seats.a.root, 'unfinished.txt');
    writeFileSync(path, 'draft');
    const retained = new RetainedWorkspaces(manager);
    expect(retained.list().workspaces).toEqual([]);
    manager.retain('run-one');
    const before = retained.list();
    expect(before.unavailableRuns).toEqual([]);
    expect(before.workspaces).toHaveLength(2);
    expect(before.workspaces[0]).toMatchObject({
      runId: 'run-one',
      seat: 'a',
      path: run.seats.a.root,
      keepForNowAt: null,
    });
    const kept = retained.keepForNow('run-one', 'a');
    expect(kept.keepForNowAt).toEqual(expect.any(Number));
    expect(retained.keepForNow('run-one', 'a')).toEqual(kept);
    expect(new RetainedWorkspaces(manager).list().workspaces[0].keepForNowAt).toBe(
      kept.keepForNowAt,
    );
    expect(retained.list().workspaces[1].keepForNowAt).toBeNull();
    expect(readFileSync(path, 'utf8')).toBe('draft');
    expect(() => retained.keepForNow('../other', 'a')).toThrow('Invalid workspace identity');
    expect(() => retained.keepForNow('missing', 'b')).toThrow('unavailable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
