export const selections = ['a', 'b', 'tie', 'combined', 'neither', 'inconclusive'] as const;
export const goalStatuses = ['solved', 'partial', 'unresolved', 'awaiting-validation'] as const;
export const criterionResults = ['met', 'partially-met', 'not-met', 'unknown'] as const;
type Selection = (typeof selections)[number];
type GoalStatus = (typeof goalStatuses)[number];
type CriterionResult = (typeof criterionResults)[number];
export type Decision = {
  selection: Selection;
  goalStatus: GoalStatus;
  summary: string;
  criteria: { index: number; result: CriterionResult; evidence: string }[];
};
type Candidate = {
  turnId: string;
  bindingId: string;
  provider: string;
  model: string;
  sha256: string;
};
export type OutcomeRevision = {
  revision: number;
  kind: 'proposed' | 'confirmed';
  proposalRevision: number | null;
  sourceMaestroTurnId: string;
  taskRevision: number;
  decision: Decision;
  candidates: { a: Candidate; b: Candidate };
  createdAt: number;
};
export type OutcomeSnapshot = {
  runId: string;
  revision: number;
  task: { revision: number; criteria: string[] } | null;
  latestProposal: OutcomeRevision | null;
  latestConfirmed: OutcomeRevision | null;
  canConfirm: boolean;
  history: OutcomeRevision[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function choice<T extends string>(items: readonly T[], value: unknown): value is T {
  return items.some((item) => item === value);
}
function candidate(value: unknown): value is Candidate {
  return (
    record(value) &&
    typeof value.turnId === 'string' &&
    typeof value.bindingId === 'string' &&
    typeof value.provider === 'string' &&
    typeof value.model === 'string' &&
    typeof value.sha256 === 'string'
  );
}
function decision(value: unknown): value is Decision {
  return (
    record(value) &&
    choice(selections, value.selection) &&
    choice(goalStatuses, value.goalStatus) &&
    typeof value.summary === 'string' &&
    Array.isArray(value.criteria) &&
    value.criteria.every(
      (item: unknown) =>
        record(item) &&
        integer(item.index) &&
        choice(criterionResults, item.result) &&
        typeof item.evidence === 'string',
    )
  );
}
function revision(value: unknown): value is OutcomeRevision {
  return (
    record(value) &&
    integer(value.revision) &&
    (value.kind === 'proposed' || value.kind === 'confirmed') &&
    (value.proposalRevision === null || integer(value.proposalRevision)) &&
    typeof value.sourceMaestroTurnId === 'string' &&
    integer(value.taskRevision) &&
    decision(value.decision) &&
    record(value.candidates) &&
    candidate(value.candidates.a) &&
    candidate(value.candidates.b) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  );
}
export function parseOutcome(value: unknown, runId: string): OutcomeSnapshot {
  if (
    !record(value) ||
    value.runId !== runId ||
    !integer(value.revision) ||
    !(
      value.task === null ||
      (record(value.task) &&
        integer(value.task.revision) &&
        Array.isArray(value.task.criteria) &&
        value.task.criteria.every((item: unknown) => typeof item === 'string'))
    ) ||
    !(value.latestProposal === null || revision(value.latestProposal)) ||
    !(value.latestConfirmed === null || revision(value.latestConfirmed)) ||
    typeof value.canConfirm !== 'boolean' ||
    !Array.isArray(value.history) ||
    !value.history.every(revision)
  )
    throw new Error('The outcome response could not be read. Retry to refresh it.');
  return value as OutcomeSnapshot;
}
export async function outcomeRequest(
  runId: string,
  path = '',
  init?: RequestInit,
): Promise<OutcomeSnapshot> {
  const response = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/state/outcomes${path}`,
    init,
  );
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'The outcome changed. Review the latest proposal before confirming again.'
        : 'Could not update or load the outcome. Retry; your edits are still here.',
    );
  return parseOutcome(await response.json(), runId);
}
