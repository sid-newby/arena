import type { Narration } from '../speech/narration.js';
import type { TokenCounts, UsageObservation } from '../state/state.contract.js';
import type { PanelExpression } from './panel-expression.js';
import type { SeatId, ParticipantRole, ProviderId, Effort } from '../runs/run.contract.js';
import type { RuntimeToolDefinition } from './runtime-tools.js';

export type AgentId = SeatId;
export type Pose = 'front' | 'left' | 'right';
export type TurnStatus = 'streaming' | 'completed' | 'stopped' | 'failed';
export type DeliveryStatus =
  | 'queued'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'limited';
export interface PanelistDelivery {
  id: string;
  recipient: AgentId;
  status: DeliveryStatus;
  detail?: string;
}
export interface ChatSnapshot {
  runId: string;
  revision: number;
  cursor: number;
  messages: {
    id: string;
    text: string;
    speechSummary?: string;
    narration?: Narration;
    status: TurnStatus;
    originalAuthor?: string;
    provider?: ProviderId;
    model?: string;
    effort?: Effort;
    bindingId?: string;
    partialRevision?: number;
    addressedTo?: AgentId;
    fromPanelist?: AgentId;
    delivery?: PanelistDelivery;
  }[];
  pendingPanelistMessages: number;
  activeSource?: 'human' | 'panelist';
  status: 'idle' | 'working' | 'failed';
  error?: string;
  pose: Pose;
  poseRevision: number;
  expression?: PanelExpression | null;
  serverNow?: number;
  sessionNotice?: string;
}
export interface AgentInfo {
  id: ParticipantRole;
  provider: ProviderId;
  effort: Effort;
  name: string;
  model: string;
  runtime: string;
  status: 'ready' | 'unavailable';
  reason?: string;
}
export interface HistoryTurn {
  prompt: string;
  text: string;
  status: TurnStatus;
  tools: { name: string; input: string; output: string }[];
}
export interface TurnContext {
  usage?: (observation: UsageObservation) => void;
  usageBaseline?: TokenCounts;
  saveUsageBaseline?: (continuation: string, tokens: TokenCounts) => void;
  tools?: RuntimeToolDefinition[];
  instructions?: string;
  text: string;
  session?: string;
  toolVersion?: number;
  priorHistory?: HistoryTurn[];
  controller: AbortController;
  append: (text: string) => void;
  saveSession: (session: string, toolVersion?: number) => void;
  tool: (name: string, input: Record<string, unknown>) => Promise<string>;
}
export interface AgentRuntime {
  info: AgentInfo;
  run: (context: TurnContext) => Promise<void>;
}

export interface ChatExecutionPolicy {
  definitions(
    binding: import('../runs/run.contract.js').ParticipantBinding,
  ): RuntimeToolDefinition[] | undefined;
  call(
    binding: import('../runs/run.contract.js').ParticipantBinding,
    turnId: string,
    name: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<string | undefined>;
  submit(runId: string, source: 'human' | 'workflow'): void;
  started(runId: string, seat: SeatId, turnId: string): void;
  address(runId: string, turnId: string): void;
  drain(runId: string): boolean;
  stopped(runId: string): void;
}
