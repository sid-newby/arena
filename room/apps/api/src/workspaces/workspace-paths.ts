import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function workspacePaths() {
  const roomRoot = resolve(
    process.env.ROOM_WORKSPACE ?? fileURLToPath(new URL('../../../../', import.meta.url)),
  );
  return {
    controlRoot: resolve(
      process.env.ROOM_CONTROL_HOME ?? join(homedir(), '.local', 'state', 'lilbits'),
      'workbench',
    ),
    managedRoot: resolve(
      process.env.ROOM_MANAGED_WORKSPACE_ROOT ?? join(dirname(roomRoot), 'workspaces'),
    ),
  };
}
