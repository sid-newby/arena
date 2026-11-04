import { parseRunReference } from './agents.ts';
import {
  cleanTask,
  parseWorkflow,
  workflowRequest,
  type ProviderConfig,
  type SeatId,
  type TaskDraft,
  type WorkflowSnapshot,
} from './run-workflow.ts';

export function isSimpleDebate(task: TaskDraft) {
  return (
    task.mode === 'reasoning' &&
    task.profile === 'analysis' &&
    !task.source &&
    !task.scaffold &&
    !task.projectDirectory
  );
}

function sameTask(left: TaskDraft | null, right: TaskDraft | null) {
  return JSON.stringify(left && cleanTask(left)) === JSON.stringify(right && cleanTask(right));
}
function sameSeats(left: Record<SeatId, ProviderConfig>, right: Record<SeatId, ProviderConfig>) {
  return (['a', 'b'] as const).every(
    (seat) =>
      left[seat].provider === right[seat].provider &&
      left[seat].model === right[seat].model &&
      left[seat].effort === right[seat].effort,
  );
}

export async function startDebate({
  baseline,
  expectedRevision,
  task: draft,
  seats,
  signal,
  identity,
  assertCurrent,
  onSaved,
  onRevision,
  onProgress,
  request = workflowRequest,
}: {
  baseline: WorkflowSnapshot;
  expectedRevision: number;
  task: TaskDraft;
  seats: Record<SeatId, ProviderConfig>;
  signal: AbortSignal;
  identity: (action: string, revision: number) => string;
  assertCurrent: () => void;
  onSaved: (snapshot: WorkflowSnapshot) => void;
  onRevision: (revision: number) => void;
  onProgress: (label: string) => void;
  request?: typeof workflowRequest;
}): Promise<WorkflowSnapshot> {
  let task = cleanTask(draft);
  if (!isSimpleDebate(task)) throw new Error('Use advanced settings for this task configuration.');
  const runId = baseline.runId;
  const parse = (value: unknown) => parseWorkflow(value, runId);
  let current = await request(runId, '/workflow', parse, undefined, signal);
  assertCurrent();
  if (
    current.evidenceFolderFromPrompt &&
    current.workspaces &&
    current.task?.evidenceFolder &&
    !baseline.workspaces &&
    !baseline.task?.evidenceFolder &&
    !task.evidenceFolder
  ) {
    const resolved = { ...task, evidenceFolder: current.task.evidenceFolder };
    if (sameTask(current.task, resolved)) task = resolved;
  }
  const saved = sameTask(current.task, task) && sameSeats(current.seats, seats);
  const configuredOnly =
    current.revision === expectedRevision + 1 &&
    !sameSeats(baseline.seats, seats) &&
    sameSeats(current.seats, seats) &&
    sameTask(current.task, baseline.task) &&
    current.phase === (baseline.task ? 'draft' : baseline.phase);
  if (current.revision !== expectedRevision && !saved && !configuredOnly)
    throw new Error('The saved run changed. Review the saved settings before starting.');
  if (current.workspaceError) throw new Error(current.workspaceError);
  if (current.workspaces && current.task?.evidenceFolder !== task.evidenceFolder)
    throw new Error('Evidence is frozen for this run. Create a new run to change its folder.');
  if (
    saved &&
    ['independent', 'awaiting-comparison', 'comparison', 'discussion', 'completed'].includes(
      current.phase,
    )
  ) {
    onSaved(current);
    return current;
  }
  if (current.busy || !['draft', 'ready', 'failed'].includes(current.phase))
    throw new Error(
      'The run is still preparing or needs attention. Review its saved state before retrying.',
    );
  if (!sameSeats(current.seats, seats)) {
    onProgress('Saving models');
    const configured = await request(
      runId,
      '/configurations',
      parseRunReference,
      { expectedRevision: current.revision, seats },
      signal,
    );
    assertCurrent();
    // Changing a seat resets a configured workflow to draft so its new binding can be prepared.
    current = {
      ...current,
      phase: current.task ? 'draft' : current.phase,
      revision: configured.revision,
      seats,
    };
    onRevision(current.revision);
  }
  if (!sameTask(current.task, task) || current.phase === 'failed') {
    onProgress('Saving draft');
    current = await request(
      runId,
      '/task',
      parse,
      { expectedRevision: current.revision, task },
      signal,
    );
    assertCurrent();
  }
  onSaved(current);
  if (current.phase !== 'ready') {
    onProgress('Preparing workspaces');
    current = await request(
      runId,
      '/prepare',
      parse,
      { expectedRevision: current.revision, requestId: identity('prepare', current.revision) },
      signal,
    );
    assertCurrent();
    onSaved(current);
  }
  if (current.workspaceError) throw new Error(current.workspaceError);
  if (current.phase !== 'ready' || current.busy)
    throw new Error(
      current.error || 'Workspaces are not ready. Review the saved run before starting.',
    );
  onProgress('Starting debate');
  current = await request(
    runId,
    '/start',
    parse,
    { expectedRevision: current.revision, requestId: identity('start', current.revision) },
    signal,
  );
  assertCurrent();
  onSaved(current);
  if (current.phase !== 'independent' && current.phase !== 'awaiting-comparison')
    throw new Error(current.error || 'Starting the debate was interrupted. Review the saved run.');
  return current;
}
