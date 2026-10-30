import type { SeatId } from '../runs/run.contract.js';

export type SideTurnStatus = 'queued' | 'streaming' | 'completed' | 'stopped' | 'failed';
export interface SideMessage {
  id: string;
  requestId: string;
  prompt: string;
  text: string;
  status: SideTurnStatus;
  error?: string;
}
export interface SideConversationSnapshot {
  runId: string;
  seat: SeatId;
  bindingId: string;
  revision: number;
  status: 'idle' | 'working' | 'failed';
  messages: SideMessage[];
  error?: string;
}
