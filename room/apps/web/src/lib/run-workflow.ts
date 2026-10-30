import {
  isEffort,
  type ProviderCatalog,
  type ProviderConfig,
  type SeatId,
  type TaskDraft,
  type WorkflowSnapshot,
  type WorkflowPhase,
  type ArtifactMetadata,
  type ArtifactView,
  type ActionProposal,
} from '../../../api/src/runs/run.contract.ts';
import { api, parseRunReference } from './agents.ts';

export type {
  TaskDraft,
  WorkflowSnapshot,
  WorkflowPhase,
  ArtifactMetadata,
  ArtifactView,
  ActionProposal,
  ProviderCatalog,
  ProviderConfig,
  SeatId,
};

const phases: WorkflowPhase[] = [
  'draft',
  'preparing',
  'ready',
  'independent',
  'awaiting-comparison',
  'comparison',
  'discussion',
  'paused',
  'completed',
  'stopped',
  'interrupted',
  'failed',
];
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function phase(value: unknown): value is WorkflowPhase {
  return phases.some((item) => item === value);
}
export function parseProvider(value: unknown): ProviderConfig {
  if (
    !record(value) ||
    (value.provider !== 'codex' && value.provider !== 'anthropic') ||
    typeof value.model !== 'string' ||
    !value.model ||
    !isEffort(value.effort)
  )
    throw new Error('The selected model configuration could not be read.');
  return { provider: value.provider, model: value.model, effort: value.effort };
}
export function parseProviderCatalog(value: unknown): ProviderCatalog {
  if (
    !record(value) ||
    (value.provider !== 'codex' && value.provider !== 'anthropic') ||
    (value.status !== 'ready' && value.status !== 'unavailable') ||
    !Array.isArray(value.models) ||
    (value.reason !== undefined && typeof value.reason !== 'string')
  )
    throw new Error('The subscribed model catalog could not be read.');
  const models = value.models.map((entry) => {
    if (
      !record(entry) ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      typeof entry.name !== 'string' ||
      !Array.isArray(entry.efforts) ||
      !entry.efforts.every(isEffort)
    )
      throw new Error('The model catalog has invalid capability metadata.');
    return { id: entry.id, name: entry.name, efforts: [...entry.efforts] };
  });
  if (new Set(models.map((entry) => entry.id)).size !== models.length)
    throw new Error('The model catalog contains duplicate selections.');
  return {
    provider: value.provider,
    status: value.status,
    models,
    ...(value.reason === undefined ? {} : { reason: value.reason }),
  };
}
export function parseTask(value: unknown): TaskDraft {
  if (
    !record(value) ||
    typeof value.question !== 'string' ||
    !value.question.trim() ||
    (value.mode !== 'reasoning' && value.mode !== 'prototype') ||
    typeof value.expectedArtifact !== 'string' ||
    !strings(value.criteria) ||
    !strings(value.grounding) ||
    (value.profile !== 'analysis' && value.profile !== 'build') ||
    !integer(value.maxHandoffs) ||
    value.maxHandoffs > 8 ||
    !integer(value.timeLimitSeconds, 30) ||
    value.timeLimitSeconds > 3600 ||
    (value.mode === 'prototype' && value.profile !== 'build')
  )
    throw new Error('The saved task has invalid settings. Reload the saved run.');
  if (
    value.projectDirectory !== undefined &&
    (typeof value.projectDirectory !== 'string' || !value.projectDirectory)
  )
    throw new Error('The project directory could not be read.');
  const source = parseSource(value.source);
  let scaffold: TaskDraft['scaffold'];
  if (value.scaffold !== undefined) {
    if (
      !record(value.scaffold) ||
      typeof value.scaffold.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.scaffold.id) ||
      source ||
      (value.scaffold.digest !== undefined &&
        (typeof value.scaffold.digest !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.scaffold.digest)))
    )
      throw new Error('The saved scaffold could not be read.');
    scaffold = {
      id: value.scaffold.id,
      ...(typeof value.scaffold.digest === 'string' ? { digest: value.scaffold.digest } : {}),
    };
  }
  return {
    question: value.question,
    mode: value.mode,
    expectedArtifact: value.expectedArtifact,
    criteria: [...value.criteria],
    grounding: [...value.grounding],
    source,
    ...(typeof value.projectDirectory === 'string'
      ? { projectDirectory: value.projectDirectory }
      : {}),
    ...(scaffold ? { scaffold } : {}),
    profile: value.profile,
    maxHandoffs: value.maxHandoffs,
    timeLimitSeconds: value.timeLimitSeconds,
  };
}
function parseSource(value: unknown): TaskDraft['source'] {
  if (value === null) return null;
  if (
    !record(value) ||
    typeof value.repository !== 'string' ||
    !value.repository ||
    typeof value.revision !== 'string' ||
    !value.revision
  )
    throw new Error('The saved source selection could not be read.');
  return { repository: value.repository, revision: value.revision };
}

export function parseArtifact(value: unknown, runId: string): ArtifactMetadata {
  if (
    !record(value) ||
    value.runId !== runId ||
    typeof value.id !== 'string' ||
    !value.id ||
    (value.seat !== 'a' && value.seat !== 'b' && value.seat !== 'maestro') ||
    typeof value.turnId !== 'string' ||
    typeof value.path !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.mimeType !== 'string' ||
    (value.sourceRevision !== null && typeof value.sourceRevision !== 'string') ||
    !integer(value.bytes) ||
    !integer(value.createdAt)
  )
    throw new Error('Artifact provenance could not be read.');
  return {
    id: value.id,
    runId,
    seat: value.seat,
    turnId: value.turnId,
    path: value.path,
    title: value.title,
    sha256: value.sha256,
    mimeType: value.mimeType,
    sourceRevision: value.sourceRevision,
    bytes: value.bytes,
    createdAt: value.createdAt,
  };
}
function parseProposal(value: unknown): ActionProposal {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    (value.kind !== 'instruction' && value.kind !== 'pause') ||
    (value.target !== 'a' && value.target !== 'b' && value.target !== 'both') ||
    typeof value.text !== 'string' ||
    !integer(value.revision, 1) ||
    (value.status !== 'proposed' && value.status !== 'applied')
  )
    throw new Error('The proposed action could not be read.');
  return {
    id: value.id,
    kind: value.kind,
    target: value.target,
    text: value.text,
    revision: value.revision,
    status: value.status,
  };
}
function parseSeats(value: unknown): Record<SeatId, ProviderConfig> {
  if (!record(value)) throw new Error('The proposed model selections could not be read.');
  return { a: parseProvider(value.a), b: parseProvider(value.b) };
}
function parseRetrySeats(value: unknown): SeatId[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length)
    throw new Error('The unfinished candidate selection could not be read.');
  return value.map((seat: unknown) => {
    if (seat !== 'a' && seat !== 'b')
      throw new Error('The unfinished candidate selection could not be read.');
    return seat;
  });
}
export function parseWorkflow(value: unknown, runId: string): WorkflowSnapshot {
  if (
    !record(value) ||
    value.runId !== runId ||
    !integer(value.revision, 1) ||
    !phase(value.phase) ||
    !record(value.seats) ||
    !Array.isArray(value.artifacts) ||
    typeof value.busy !== 'boolean' ||
    (value.error !== undefined && typeof value.error !== 'string')
  )
    throw new Error('The run returned an unreadable update. Reload its saved state.');
  const task = value.task === null ? null : parseTask(value.task);
  if (task === null && !['draft', 'stopped'].includes(value.phase))
    throw new Error('The run has no reviewed task for its current phase.');
  let workspaces: WorkflowSnapshot['workspaces'] = null;
  if (value.workspaces !== null) {
    const workspace = value.workspaces;
    if (
      !record(workspace) ||
      typeof workspace.state !== 'string' ||
      !record(workspace.seats) ||
      !record(workspace.seats.a) ||
      !record(workspace.seats.b) ||
      typeof workspace.seats.a.root !== 'string' ||
      typeof workspace.seats.b.root !== 'string'
    )
      throw new Error('Workspace readiness could not be read.');
    const source = parseSource(workspace.source);
    if (source && !/^[a-f0-9]{40,64}$/.test(source.revision))
      throw new Error('The prepared source commit could not be read.');
    workspaces = {
      state: workspace.state,
      source,
      seats: { a: { root: workspace.seats.a.root }, b: { root: workspace.seats.b.root } },
    };
  }
  if (value.phase === 'ready' && workspaces?.state !== 'ready')
    throw new Error('The run is not ready to start. Its workspaces need preparation.');
  return {
    runId,
    revision: value.revision,
    phase: value.phase,
    task,
    seats: { a: parseProvider(value.seats.a), b: parseProvider(value.seats.b) },
    workspaces,
    artifacts: value.artifacts.map((entry) => parseArtifact(entry, runId)),
    busy: value.busy,
    retrySeats: parseRetrySeats(value.retrySeats),
    ...(value.error === undefined ? {} : { error: value.error }),
    ...(value.proposal === undefined ? {} : { proposal: parseProposal(value.proposal) }),
    ...(value.proposedSeats === undefined
      ? {}
      : { proposedSeats: parseSeats(value.proposedSeats) }),
  };
}
export function parseArtifactView(value: unknown, runId: string, artifactId: string): ArtifactView {
  if (
    !record(value) ||
    (value.text !== null && typeof value.text !== 'string') ||
    typeof value.truncated !== 'boolean'
  )
    throw new Error('This artifact preview could not be read.');
  const artifact = parseArtifact(value.artifact, runId);
  const downloadUrl = `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/download`;
  if (artifact.id !== artifactId || value.downloadUrl !== downloadUrl)
    throw new Error('The artifact preview belongs to another output.');
  return { artifact, text: value.text, truncated: value.truncated, downloadUrl };
}
export function defaultTask(): TaskDraft {
  return {
    question: '',
    mode: 'reasoning',
    expectedArtifact: 'A reasoned answer with supporting evidence',
    criteria: [],
    grounding: [],
    source: null,
    profile: 'analysis',
    maxHandoffs: 4,
    timeLimitSeconds: 600,
  };
}
export function cleanTask(task: TaskDraft): TaskDraft {
  const cleaned = {
    ...task,
    question: task.question.trim(),
    expectedArtifact: task.expectedArtifact.trim(),
    criteria: task.criteria.map((line) => line.trim()).filter(Boolean),
    grounding: task.grounding.map((line) => line.trim()).filter(Boolean),
    projectDirectory: task.projectDirectory?.trim() || undefined,
    source: task.source?.repository.trim()
      ? {
          repository: task.source.repository.trim(),
          revision: task.source.revision.trim() || 'HEAD',
        }
      : null,
  };
  if (!cleaned.question) throw new Error('Enter a question or task.');
  if (cleaned.question.length > 6000 || cleaned.expectedArtifact.length > 1000)
    throw new Error(
      'Keep the question under 6,000 characters and the intended result under 1,000.',
    );
  if (cleaned.criteria.length > 8 || cleaned.criteria.some((line) => line.length > 500))
    throw new Error('Use up to 8 success criteria, each under 500 characters.');
  if (cleaned.grounding.length > 20 || cleaned.grounding.some((line) => line.length > 1000))
    throw new Error('Use up to 20 shared notes, each under 1,000 characters.');
  if (!Number.isInteger(cleaned.maxHandoffs) || cleaned.maxHandoffs < 0 || cleaned.maxHandoffs > 8)
    throw new Error('Choose a whole number of handoffs from 0 to 8.');
  if (
    !Number.isInteger(cleaned.timeLimitSeconds) ||
    cleaned.timeLimitSeconds < 30 ||
    cleaned.timeLimitSeconds > 3600
  )
    throw new Error('Choose a time limit from 30 to 3,600 whole seconds.');
  if (JSON.stringify(cleaned).length > 10000)
    throw new Error('Keep the task, criteria, and shared notes together under 10,000 characters.');
  return parseTask(cleaned);
}

export function canEditWorkflow(snapshot: WorkflowSnapshot): boolean {
  return (
    !snapshot.busy &&
    (snapshot.phase === 'draft' || snapshot.phase === 'ready' || snapshot.phase === 'failed')
  );
}
export function workflowLabel(value: WorkflowPhase): string {
  const labels: Record<WorkflowPhase, string> = {
    draft: 'Draft',
    preparing: 'Preparing workspaces',
    ready: 'Ready for your review',
    independent: 'Independent work',
    'awaiting-comparison': 'Both outputs ready',
    comparison: 'Comparing outputs',
    discussion: 'Bounded discussion',
    paused: 'Paused',
    completed: 'Completed',
    stopped: 'Stopped',
    interrupted: 'Interrupted',
    failed: 'Needs attention',
  };
  return labels[value];
}
export function runPath(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}`;
}
export function workflowRequest<T>(
  runId: string,
  path: string,
  parse: (value: unknown) => T,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return api(runPath(runId) + path, parse, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
  });
}

export interface RunChoice {
  id: string;
  revision: number;
  state: string;
  createdAt: number;
}
export function parseRunChoices(value: unknown): RunChoice[] {
  if (!record(value) || !Array.isArray(value.runs) || typeof value.currentRunId !== 'string')
    throw new Error('Retained runs could not be read.');
  return value.runs.map((item) => {
    const reference = parseRunReference(item);
    if (!record(item) || !integer(item.createdAt) || typeof item.state !== 'string')
      throw new Error('A retained run could not be read.');
    return { ...reference, state: item.state, createdAt: item.createdAt };
  });
}
