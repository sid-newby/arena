export interface RetainedWorkspace {
  runId: string;
  seat: 'a' | 'b';
  path: string;
  retainedAt: number;
  keepForNowAt: number | null;
}

export interface RetainedInventory {
  workspaces: RetainedWorkspace[];
  unavailableRuns: string[];
}

export interface PreservedResult {
  runId: string;
  seat: 'a' | 'b';
  path: string;
  digest: string;
  excluded: string[];
  preservedAt: number;
  remote?: string;
  cleanedAt?: number;
}

export function parsePreservedResult(value: unknown): PreservedResult | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.runId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.runId) ||
    (value.seat !== 'a' && value.seat !== 'b') ||
    typeof value.path !== 'string' ||
    !value.path ||
    typeof value.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    !Array.isArray(value.excluded) ||
    !value.excluded.every((item: unknown) => typeof item === 'string') ||
    !isTimestamp(value.preservedAt) ||
    (value.cleanedAt !== undefined && !isTimestamp(value.cleanedAt)) ||
    (value.remote !== undefined &&
      (typeof value.remote !== 'string' ||
        !/^https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/.test(value.remote)))
  )
    throw new Error('The preserved result response is invalid.');
  return {
    runId: value.runId,
    seat: value.seat,
    path: value.path,
    digest: value.digest,
    excluded: value.excluded,
    preservedAt: value.preservedAt,
    remote: value.remote,
    cleanedAt: value.cleanedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8640000000000000
  );
}

export function parseRetainedWorkspace(value: unknown): RetainedWorkspace {
  if (
    !isRecord(value) ||
    typeof value.runId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.runId) ||
    (value.seat !== 'a' && value.seat !== 'b') ||
    typeof value.path !== 'string' ||
    !value.path ||
    !isTimestamp(value.retainedAt) ||
    (value.keepForNowAt !== null && !isTimestamp(value.keepForNowAt))
  )
    throw new Error('The retained workspace response is invalid.');
  return {
    runId: value.runId,
    seat: value.seat,
    path: value.path,
    retainedAt: value.retainedAt,
    keepForNowAt: value.keepForNowAt,
  };
}

export function parseRetainedInventory(value: unknown): RetainedInventory {
  if (
    !isRecord(value) ||
    !Array.isArray(value.workspaces) ||
    !Array.isArray(value.unavailableRuns) ||
    !value.unavailableRuns.every(
      (run: unknown) => typeof run === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(run),
    )
  )
    throw new Error('The retained workspace list is invalid.');
  return {
    workspaces: value.workspaces.map(parseRetainedWorkspace),
    unavailableRuns: value.unavailableRuns,
  };
}
