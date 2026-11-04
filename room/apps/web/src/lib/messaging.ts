import type {
  MessageIntent,
  MessageReceipt,
  MessageStatus,
  WorkflowInvalidation,
} from '../../../api/src/chat/message.contract.ts';
import type {
  SideConversationSnapshot,
  SideMessage,
  SideTurnStatus,
} from '../../../api/src/chat/side-conversation.contract.ts';
import type { AgentId } from './agents.ts';

export type { MessageIntent, MessageReceipt, SideConversationSnapshot };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function intent(value: unknown): value is MessageIntent {
  return value === 'send' || value === 'queue' || value === 'interrupt';
}
function messageStatus(value: unknown): value is MessageStatus {
  return (
    value === 'queued' ||
    value === 'dispatching' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'stopped' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'uncertain'
  );
}
function sideStatus(value: unknown): value is SideTurnStatus {
  return (
    value === 'queued' ||
    value === 'streaming' ||
    value === 'completed' ||
    value === 'stopped' ||
    value === 'failed'
  );
}

export function parseMessageReceipt(
  value: unknown,
  runId?: string,
  seat?: AgentId,
): MessageReceipt {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.requestId !== 'string' ||
    !value.requestId ||
    typeof value.runId !== 'string' ||
    (runId !== undefined && value.runId !== runId) ||
    (value.seat !== 'a' && value.seat !== 'b') ||
    (seat !== undefined && value.seat !== seat) ||
    typeof value.bindingId !== 'string' ||
    !value.bindingId ||
    !integer(value.revision) ||
    value.revision < 1 ||
    !intent(value.intent) ||
    typeof value.text !== 'string' ||
    !messageStatus(value.status) ||
    !integer(value.createdAt) ||
    (value.turnId !== undefined && typeof value.turnId !== 'string') ||
    (value.error !== undefined && typeof value.error !== 'string')
  )
    throw new Error('The API returned an unreadable message receipt. Retry the same request.');
  return {
    id: value.id,
    requestId: value.requestId,
    runId: value.runId,
    seat: value.seat,
    bindingId: value.bindingId,
    revision: value.revision,
    intent: value.intent,
    text: value.text,
    status: value.status,
    createdAt: value.createdAt,
    ...(value.turnId !== undefined ? { turnId: value.turnId } : {}),
    ...(value.error !== undefined ? { error: value.error } : {}),
  };
}

export function parseHumanMessages(value: unknown, runId?: string): MessageReceipt[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Unreadable saved message list.');
  return value.map((message) => parseMessageReceipt(message, runId));
}

export function parseWorkflowInvalidation(value: unknown, runId: string): WorkflowInvalidation {
  if (
    !record(value) ||
    value.runId !== runId ||
    !integer(value.revision) ||
    value.revision < 1 ||
    !integer(value.cursor)
  )
    throw new Error('Unreadable run update.');
  return { runId: value.runId, revision: value.revision, cursor: value.cursor };
}

export function parseSideSnapshot(
  value: unknown,
  runId: string,
  seat: AgentId,
): SideConversationSnapshot {
  if (
    !record(value) ||
    value.runId !== runId ||
    value.seat !== seat ||
    typeof value.bindingId !== 'string' ||
    !integer(value.revision) ||
    value.revision < 1 ||
    (value.status !== 'idle' && value.status !== 'working' && value.status !== 'failed') ||
    !Array.isArray(value.messages) ||
    (value.error !== undefined && typeof value.error !== 'string')
  )
    throw new Error('The side conversation returned an unreadable update.');
  const messages: SideMessage[] = value.messages.map((message) => {
    if (
      !record(message) ||
      typeof message.id !== 'string' ||
      typeof message.requestId !== 'string' ||
      typeof message.prompt !== 'string' ||
      typeof message.text !== 'string' ||
      !sideStatus(message.status) ||
      (message.error !== undefined && typeof message.error !== 'string')
    )
      throw new Error('The side conversation returned an unreadable message.');
    return {
      id: message.id,
      requestId: message.requestId,
      prompt: message.prompt,
      text: message.text,
      status: message.status,
      ...(message.error !== undefined ? { error: message.error } : {}),
    };
  });
  return {
    runId,
    seat,
    bindingId: value.bindingId,
    revision: value.revision,
    status: value.status,
    messages,
    ...(value.error !== undefined ? { error: value.error } : {}),
  };
}

export function receiptLabel(status: MessageStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'dispatching':
      return 'Sending';
    case 'running':
      return 'Replying';
    case 'completed':
      return 'Completed';
    case 'stopped':
      return 'Stopped';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'uncertain':
      return 'Delivery unconfirmed';
  }
}

export function messagePending(message: MessageReceipt): boolean {
  return (
    message.status === 'queued' ||
    message.status === 'dispatching' ||
    message.status === 'running' ||
    message.status === 'uncertain'
  );
}
