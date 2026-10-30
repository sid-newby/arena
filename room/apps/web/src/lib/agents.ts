import type { Narration } from './speech-queue';
import { DEBATE_SEATS, type SeatId, type ProviderId } from '../../../api/src/runs/run.contract.ts';
import type { ScopedCatalog } from './run-scope.ts';
import { ExpressionClock, parseExpression, type ExpressionSnapshot } from './panel-expression.ts';

export const agentIds = DEBATE_SEATS;
export type AgentId = SeatId;
export type Pose = 'left' | 'front' | 'right';
export type AgentInfo = {
  id: AgentId;
  name: string;
  model: string;
  provider: ProviderId;
  effort: string;
  runtime: string;
  status: 'ready' | 'unavailable';
  reason?: string;
};
export const panelistDeliveryStatuses = [
  'queued',
  'dispatched',
  'completed',
  'failed',
  'cancelled',
  'limited',
] as const;
export type PanelistDelivery = {
  id: string;
  recipient: AgentId;
  status: (typeof panelistDeliveryStatuses)[number];
  detail?: string;
};
export function panelistName(agent: AgentId): string {
  return agent === 'a' ? 'A' : 'B';
}
const modelNames = [
  { pattern: /^(?:claude-)?opus(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Opus' },
  { pattern: /^(?:claude-)?sonnet(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Sonnet' },
  { pattern: /^(?:claude-)?haiku(?:-\d+)+(?:-(?:latest|preview))?$/i, name: 'Haiku' },
  { pattern: /^gpt-\d+(?:\.\d+)*-sol(?:-[a-z0-9]+)*$/i, name: 'Sol' },
  { pattern: /^gpt-\d+(?:\.\d+)*-luna(?:-[a-z0-9]+)*$/i, name: 'Luna' },
  { pattern: /^gpt-\d+(?:\.\d+)*-astra(?:-[a-z0-9]+)*$/i, name: 'Astra' },
  { pattern: /^gpt-\d+(?:\.\d+)*-terra(?:-[a-z0-9]+)*$/i, name: 'Terra' },
];
export function modelPanelName(model: string | undefined, seat: AgentId): string {
  if (!model?.trim()) return panelistName(seat);
  return modelNames.find(({ pattern }) => pattern.test(model.trim()))?.name ?? model;
}
export function panelistDeliveryLabel(delivery: PanelistDelivery): string {
  const name = panelistName(delivery.recipient);
  switch (delivery.status) {
    case 'queued':
      return `Queued for ${name}`;
    case 'dispatched':
      return `Sending to ${name}`;
    case 'completed':
      return `${name} replied`;
    case 'failed':
      return 'Delivery failed';
    case 'cancelled':
      return 'Stopped';
    case 'limited':
      return 'Exchange limit reached';
  }
}
export type Reply = {
  originalAuthor?: string;
  provider?: ProviderId;
  model?: string;
  effort?: string;
  bindingId?: string;
  partialRevision?: number;
  id: string;
  text: string;
  speechSummary?: string;
  narration?: Narration;
  status: 'streaming' | 'completed' | 'stopped' | 'failed';
  addressedTo?: AgentId;
  fromPanelist?: AgentId;
  delivery?: PanelistDelivery;
};
export type Snapshot = ExpressionSnapshot & {
  runId?: string;
  revision?: number;
  cursor?: number;
  messages: Reply[];
  status: 'idle' | 'working' | 'failed';
  error?: string;
  pose: Pose;
  poseRevision: number;
  sessionNotice?: string;
  activeSource?: 'human' | 'panelist';
  pendingPanelistMessages: number;
};
export const emptySnapshot: Snapshot = {
  messages: [],
  pendingPanelistMessages: 0,
  status: 'idle',
  pose: 'front',
  poseRevision: 0,
  expression: null,
  serverNow: 0,
  receivedAt: 0,
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseCatalog(value: unknown): AgentInfo[] {
  if (!record(value) || !Array.isArray(value.agents))
    throw new Error('The agent directory could not be read.');
  const agents = value.agents;
  for (const agent of agents) {
    if (
      !record(agent) ||
      !agentIds.includes(agent.id as AgentId) ||
      typeof agent.name !== 'string' ||
      typeof agent.model !== 'string' ||
      (agent.provider !== 'codex' && agent.provider !== 'anthropic') ||
      typeof agent.effort !== 'string' ||
      typeof agent.runtime !== 'string' ||
      !['ready', 'unavailable'].includes(String(agent.status)) ||
      (agent.reason !== undefined && typeof agent.reason !== 'string')
    ) {
      throw new Error('The agent directory returned an invalid agent.');
    }
  }
  if (!agentIds.every((id) => agents.filter((agent) => agent.id === id).length === 1)) {
    throw new Error('The agent directory is incomplete.');
  }
  return agents as AgentInfo[];
}

export function parseScopedCatalog(value: unknown, expectedRunId: string): ScopedCatalog {
  if (!record(value) || value.runId !== expectedRunId)
    throw new Error('The agent directory belongs to another run. Reconnect to continue.');
  const run = parseRunReference({ id: value.runId, revision: value.revision });
  return { runId: run.id, revision: run.revision, agents: parseCatalog(value) };
}

export function parseRunReference(value: unknown): { id: string; revision: number } {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  )
    throw new Error('The current run could not be read. Reconnect to try again.');
  return { id: value.id, revision: value.revision };
}

function isAgentId(value: unknown): value is AgentId {
  return value === 'a' || value === 'b';
}
function validDelivery(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    isAgentId(value.recipient) &&
    panelistDeliveryStatuses.some((status) => status === value.status) &&
    (value.detail === undefined || typeof value.detail === 'string')
  );
}

function validNarration(value: unknown): boolean {
  return (
    record(value) &&
    ((value.status === 'unavailable' && typeof value.reason === 'string') ||
      (value.status === 'ready' &&
        typeof value.revision === 'string' &&
        /^[a-f0-9]{64}$/.test(value.revision) &&
        Array.isArray(value.segments) &&
        value.segments.length > 0 &&
        value.segments.join('').length <= 16000 &&
        value.segments.every(
          (segment) => typeof segment === 'string' && segment.length > 0 && segment.length <= 350,
        )))
  );
}

export function parseSnapshot(
  value: unknown,
  clock?: ExpressionClock,
  requestStartedAt?: number,
  expectedRunId?: string,
): Snapshot {
  if (
    !record(value) ||
    (expectedRunId !== undefined && value.runId !== expectedRunId) ||
    (value.runId !== undefined && typeof value.runId !== 'string') ||
    (value.revision !== undefined &&
      (typeof value.revision !== 'number' ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1)) ||
    (value.cursor !== undefined &&
      (typeof value.cursor !== 'number' ||
        !Number.isSafeInteger(value.cursor) ||
        value.cursor < 0)) ||
    !Array.isArray(value.messages) ||
    !['idle', 'working', 'failed'].includes(String(value.status)) ||
    !['left', 'front', 'right'].includes(String(value.pose)) ||
    (value.error !== undefined && typeof value.error !== 'string') ||
    (value.sessionNotice !== undefined && typeof value.sessionNotice !== 'string') ||
    (value.activeSource !== undefined &&
      value.activeSource !== 'human' &&
      value.activeSource !== 'panelist') ||
    (value.pendingPanelistMessages !== undefined &&
      (typeof value.pendingPanelistMessages !== 'number' ||
        !Number.isSafeInteger(value.pendingPanelistMessages) ||
        value.pendingPanelistMessages < 0)) ||
    !value.messages.every(
      (message) =>
        record(message) &&
        typeof message.id === 'string' &&
        typeof message.text === 'string' &&
        (message.speechSummary === undefined || typeof message.speechSummary === 'string') &&
        (message.narration === undefined || validNarration(message.narration)) &&
        (message.originalAuthor === undefined || typeof message.originalAuthor === 'string') &&
        (message.provider === undefined ||
          message.provider === 'codex' ||
          message.provider === 'anthropic') &&
        (message.model === undefined || typeof message.model === 'string') &&
        (message.effort === undefined || typeof message.effort === 'string') &&
        (message.bindingId === undefined || typeof message.bindingId === 'string') &&
        (message.partialRevision === undefined ||
          (typeof message.partialRevision === 'number' &&
            Number.isSafeInteger(message.partialRevision) &&
            message.partialRevision >= 0)) &&
        ['streaming', 'completed', 'stopped', 'failed'].includes(String(message.status)) &&
        (message.addressedTo === undefined || isAgentId(message.addressedTo)) &&
        (message.fromPanelist === undefined || isAgentId(message.fromPanelist)) &&
        (message.delivery === undefined || validDelivery(message.delivery)),
    )
  ) {
    throw new Error('The agent returned an unreadable update. Reconnect to try again.');
  }
  const expression = parseExpression(value.expression);
  if (expression && (typeof value.serverNow !== 'number' || !Number.isFinite(value.serverNow)))
    throw new Error('The agent returned an expression without its server clock.');
  const receivedAt = performance.now();
  const serverNow =
    typeof value.serverNow === 'number' && Number.isFinite(value.serverNow) ? value.serverNow : 0;
  if (clock && requestStartedAt !== undefined)
    clock.calibrate(serverNow, requestStartedAt, receivedAt);
  return {
    ...value,
    pendingPanelistMessages: value.pendingPanelistMessages ?? 0,
    poseRevision: typeof value.poseRevision === 'number' ? value.poseRevision : 0,
    expression,
    serverNow: clock ? clock.estimate(serverNow, receivedAt) : serverNow,
    receivedAt,
  } as Snapshot;
}

export async function api<T>(
  path: string,
  parse: (value: unknown) => T,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    let detail = '';
    try {
      const body: unknown = await response.json();
      if (record(body) && typeof body.message === 'string') detail = body.message;
    } catch {
      /* HTTP status remains available when a proxy returns HTML. */
    }
    throw new Error(detail || `Request failed (${response.status}). Try again.`);
  }
  return parse(await response.json());
}

export const previewSnapshots: Record<AgentId, Snapshot> = {
  a: {
    ...emptySnapshot,
    status: 'idle',
    pose: 'right',
    poseRevision: 0,
    messages: [
      {
        id: 'preview-a',
        status: 'completed',
        text: 'Give the idea some room.\n\nStart with the part you can’t stop thinking about. A question, a half-formed thought, something you want to make.\n\nWe can find the shape together.',
      },
    ],
  },
  b: {
    ...emptySnapshot,
    status: 'idle',
    pose: 'left',
    poseRevision: 0,
    messages: [
      {
        id: 'preview-b',
        status: 'completed',
        text: 'Let’s make it concrete.\n\nTell me what you’re working toward and what’s getting in the way. I’ll help you pull it apart, test the assumptions, and work out what comes next.\n\nTwo perspectives. Your direction.',
      },
    ],
  },
};
