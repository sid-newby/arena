export const DEBATE_SEATS = ['a', 'b'] as const;
export type SeatId = (typeof DEBATE_SEATS)[number];
export type ParticipantRole = SeatId | 'maestro';
export type ProviderId = 'codex' | 'anthropic';
export const EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;
export type Effort = (typeof EFFORTS)[number];
export function isEffort(value: unknown): value is Effort {
  return EFFORTS.some((effort) => effort === value);
}
export function isSeatId(value: unknown): value is SeatId {
  return value === 'a' || value === 'b';
}
export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  effort: Effort;
}
export interface ProviderCatalog {
  provider: ProviderId;
  status: 'ready' | 'unavailable';
  reason?: string;
  models: { id: string; name: string; efforts: Effort[] }[];
}
export const DEFAULT_MODELS: Record<ParticipantRole, ProviderConfig> = {
  a: { provider: 'codex', model: 'gpt-6-luna', effort: 'high' },
  b: { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'high' },
  maestro: { provider: 'codex', model: 'gpt-6.1-sol', effort: 'high' },
};
export interface ParticipantBinding {
  id: string;
  runId: string;
  role: ParticipantRole;
  config: ProviderConfig;
  workspace: string;
  instructionsVersion: string;
  toolPolicyVersion: number;
  toolProfile?: 'analysis' | 'build';
}
export interface RunSnapshot {
  id: string;
  kind: 'ordinary' | 'legacy';
  state: 'ready' | 'retained' | 'interrupted';
  revision: number;
  createdAt: number;
  seats: Record<SeatId, ProviderConfig>;
  maestro: ProviderConfig;
}
export interface Correspondence {
  seq: number;
  runId: string;
  kind: string;
  role: ParticipantRole | null;
  turnId: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
}

export type WorkflowPhase =
  | 'draft'
  | 'preparing'
  | 'ready'
  | 'independent'
  | 'awaiting-comparison'
  | 'comparison'
  | 'discussion'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'interrupted'
  | 'failed';
export interface TaskDraft {
  question: string;
  mode: 'reasoning' | 'prototype';
  expectedArtifact: string;
  criteria: string[];
  grounding: string[];
  source: { repository: string; revision: string } | null;
  projectDirectory?: string;
  scaffold?: { id: string; digest?: string };
  profile: 'analysis' | 'build';
  maxHandoffs: number;
  timeLimitSeconds: number;
}
export interface ArtifactMetadata {
  id: string;
  runId: string;
  seat: SeatId | 'maestro';
  turnId: string;
  path: string;
  title: string;
  sha256: string;
  mimeType: string;
  sourceRevision: string | null;
  bytes: number;
  createdAt: number;
}
export interface ActionProposal {
  id: string;
  kind: 'instruction' | 'pause';
  target: SeatId | 'both';
  text: string;
  revision: number;
  status: 'proposed' | 'applied';
}
export interface WorkflowSnapshot {
  runId: string;
  revision: number;
  phase: WorkflowPhase;
  task: TaskDraft | null;
  seats: Record<SeatId, ProviderConfig>;
  workspaces: {
    state: string;
    source: { repository: string; revision: string } | null;
    seats: Record<SeatId, { root: string }>;
  } | null;
  artifacts: ArtifactMetadata[];
  retrySeats: SeatId[];
  busy: boolean;
  workspaceError?: string;
  error?: string;
  proposal?: ActionProposal;
  proposedSeats?: Record<SeatId, ProviderConfig>;
}
export interface ArtifactView {
  artifact: ArtifactMetadata;
  text: string | null;
  truncated: boolean;
  downloadUrl: string;
}
