import { api } from './agents.ts';

const endpoint = '/api/runs/hangout/project';

function readProject(value: unknown): string | null {
  if (value && typeof value === 'object' && 'path' in value) {
    if (value.path === null || (typeof value.path === 'string' && value.path.startsWith('/')))
      return value.path;
  }
  throw new Error('The room returned an unreadable project folder.');
}

export function loadProject(signal: AbortSignal) {
  return api(endpoint, readProject, { signal });
}

export function changeProject(path: string | null) {
  if (path !== null && !path.startsWith('/'))
    throw new Error('Enter an absolute folder path beginning with /.');
  return api(
    endpoint,
    readProject,
    path === null
      ? { method: 'DELETE' }
      : {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        },
  );
}
