import type { SeatId } from '../runs/run.contract.js';

export const MESSAGE_INTENTS = ['send', 'queue', 'interrupt'] as const;
export type MessageIntent = (typeof MESSAGE_INTENTS)[number];
export const MESSAGE_STATUSES = [
  'queued',
  'dispatching',
  'running',
  'completed',
  'stopped',
  'failed',
  'cancelled',
  'uncertain',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export interface MessageReceipt {
  id: string;
  requestId: string;
  runId: string;
  seat: SeatId;
  bindingId: string;
  revision: number;
  intent: MessageIntent;
  text: string;
  status: MessageStatus;
  turnId?: string;
  error?: string;
  createdAt: number;
}
export interface WorkflowInvalidation {
  runId: string;
  revision: number;
  cursor: number;
}
