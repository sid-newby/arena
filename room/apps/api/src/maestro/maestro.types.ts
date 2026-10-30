import type { Effort, ProviderConfig } from '../runs/run.contract.js';
import type { TurnStatus } from '../chat/chat.types.js';

export interface MaestroMessage {
  id: string;
  turnId: string;
  role: 'user' | 'assistant';
  text: string;
  status: TurnStatus;
  throughSeq?: number;
  feedback?: { eventId: string; read: boolean; question: 'none' | 'unresolved' | 'resolved' };
}
export interface MaestroSnapshot {
  runId: string;
  model: string;
  effort: Effort;
  status: 'idle' | 'working' | 'failed';
  available: boolean;
  reason?: string;
  error?: string;
  latestSeq: number;
  analysisThroughSeq?: number;
  messages: MaestroMessage[];
}
export interface PartialRevision {
  seat: 'a' | 'b';
  turnId: string;
  revision: number;
  text: string;
  characters: number;
  truncated: boolean;
}
export interface MaestroTurn {
  id: string;
  runId: string;
  requestId: string;
  prompt: string;
  text: string;
  status: TurnStatus;
  error?: string;
  throughSeq: number;
  partialRevisions: PartialRevision[];
  fingerprint: string;
}
export interface MaestroSession {
  continuation: string;
  toolVersion: number;
}
export function sessionFingerprint(
  config: ProviderConfig,
  workspace: string,
  revision: number,
): string {
  return JSON.stringify([
    config.provider,
    config.model,
    config.effort,
    workspace,
    revision,
    'maestro-v1',
    1,
  ]);
}
