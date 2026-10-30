export type MaestroMessage = {
  id: string;
  turnId?: string;
  role: 'user' | 'assistant';
  text: string;
  status: 'streaming' | 'completed' | 'stopped' | 'failed';
  throughSeq?: number;
  feedback?: { eventId: string; read: boolean; question: 'none' | 'unresolved' | 'resolved' };
};

export type MaestroSnapshot = {
  runId: string;
  model: string;
  effort: string;
  status: 'idle' | 'working' | 'failed';
  available: boolean;
  reason?: string;
  error?: string;
  latestSeq: number;
  analysisThroughSeq?: number;
  messages: MaestroMessage[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function message(value: unknown): value is MaestroMessage {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.turnId === undefined || (typeof value.turnId === 'string' && value.turnId.length > 0)) &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.text === 'string' &&
    (value.status === 'streaming' ||
      value.status === 'completed' ||
      value.status === 'stopped' ||
      value.status === 'failed') &&
    (value.role !== 'user' || value.status === 'completed') &&
    (value.throughSeq === undefined || sequence(value.throughSeq)) &&
    (value.feedback === undefined ||
      (value.role === 'assistant' &&
        typeof value.turnId === 'string' &&
        record(value.feedback) &&
        typeof value.feedback.eventId === 'string' &&
        value.feedback.eventId.length > 0 &&
        typeof value.feedback.read === 'boolean' &&
        (value.feedback.question === 'none' ||
          value.feedback.question === 'unresolved' ||
          value.feedback.question === 'resolved')))
  );
}

export function parseCurrentRun(value: unknown): string {
  if (!record(value) || typeof value.id !== 'string' || !value.id)
    throw new Error('The current run could not be read. Reconnect to try again.');
  return value.id;
}

export function parseMaestroSnapshot(value: unknown, runId: string): MaestroSnapshot {
  if (
    !record(value) ||
    value.runId !== runId ||
    typeof value.model !== 'string' ||
    typeof value.effort !== 'string' ||
    (value.status !== 'idle' && value.status !== 'working' && value.status !== 'failed') ||
    typeof value.available !== 'boolean' ||
    !sequence(value.latestSeq) ||
    (value.analysisThroughSeq !== undefined && !sequence(value.analysisThroughSeq)) ||
    (value.reason !== undefined && typeof value.reason !== 'string') ||
    (value.error !== undefined && typeof value.error !== 'string') ||
    !Array.isArray(value.messages) ||
    !value.messages.every(message) ||
    new Set(value.messages.map((entry) => entry.id)).size !== value.messages.length
  )
    throw new Error('Maestro returned an unreadable update. Reconnect to try again.');
  return {
    runId,
    model: value.model,
    effort: value.effort,
    status: value.status,
    available: value.available,
    latestSeq: value.latestSeq,
    messages: value.messages.map((entry) => ({ ...entry })),
    ...(value.reason === undefined ? {} : { reason: value.reason }),
    ...(value.error === undefined ? {} : { error: value.error }),
    ...(value.analysisThroughSeq === undefined
      ? {}
      : { analysisThroughSeq: value.analysisThroughSeq }),
  };
}

export function parseMaestroTurn(value: unknown): string {
  if (!record(value) || typeof value.turnId !== 'string' || !value.turnId)
    throw new Error('The API did not confirm this message. Retry checks the same request.');
  return value.turnId;
}

export type MaestroCancellationTarget = { requestId: string } | { turnId: string };
export function maestroCancellationTarget(
  snapshot: MaestroSnapshot | undefined,
  pendingRequestId?: string,
): MaestroCancellationTarget | undefined {
  if (pendingRequestId) return { requestId: pendingRequestId };
  const active = snapshot?.messages.findLast(
    (entry) => entry.role === 'assistant' && entry.status === 'streaming',
  );
  return active?.turnId ? { turnId: active.turnId } : undefined;
}
