import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const installedRoom = fileURLToPath(new URL('../../../../', import.meta.url));

export function workspacePaths() {
  const roomRoot = resolve(process.env.ROOM_WORKSPACE ?? installedRoom);
  return {
    roomRoot,
    controlRoot: resolve(
      process.env.ROOM_CONTROL_HOME ?? join(homedir(), '.local', 'state', 'lilbits'),
      'workbench',
    ),
    managedRoot: resolve(
      process.env.ROOM_MANAGED_WORKSPACE_ROOT ?? join(dirname(roomRoot), 'workspaces'),
    ),
  };
}

// Configured state can live behind an OS path alias or be created after attachment.
function canonicalRoot(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return path === parent ? path : join(canonicalRoot(parent), basename(path));
  }
}

export function privateProjectRoots(): string[] {
  const { roomRoot, managedRoot, controlRoot } = workspacePaths();
  const db = process.env.ROOM_DB_PATH;
  return [
    ...new Set(
      [
        dirname(controlRoot),
        managedRoot,
        join(dirname(roomRoot), 'workspaces'),
        join(dirname(resolve(installedRoom)), 'workspaces'),
        join(roomRoot, '.room'),
        ...(db && db !== ':memory:' ? [dirname(resolve(db))] : []),
        ...[
          process.env.CODEX_HOME,
          process.env.CLAUDE_CONFIG_DIR,
          process.env.CLOUDSDK_CONFIG,
          process.env.GOOGLE_APPLICATION_CREDENTIALS,
        ]
          .filter((value): value is string => Boolean(value))
          .map((value) => resolve(value)),
      ].map(canonicalRoot),
    ),
  ];
}
