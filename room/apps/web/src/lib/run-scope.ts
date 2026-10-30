import type { AgentId, AgentInfo } from './agents.ts';
import type { MessageIntent } from './messaging.ts';

export type SendScope = { runId: string; revision: number };
export type DeliveryBatch = SendScope & {
  text: string;
  targets: AgentId[];
  requestId: string;
  delivered: Set<AgentId>;
  intent: MessageIntent;
};
export type ScopedCatalog = { runId: string; revision: number; agents: AgentInfo[] };

export function deliveryMatches(
  batch: DeliveryBatch | undefined,
  scope: SendScope,
  text: string,
  targets: AgentId[],
  intent: MessageIntent = 'queue',
): batch is DeliveryBatch {
  return Boolean(
    batch &&
    batch.runId === scope.runId &&
    batch.text === text &&
    batch.intent === intent &&
    batch.targets.length === targets.length &&
    batch.targets.every((target, index) => target === targets[index]),
  );
}

export function prepareDelivery(
  batch: DeliveryBatch | undefined,
  scope: SendScope,
  text: string,
  targets: AgentId[],
  requestId: string,
  intent: MessageIntent = 'queue',
): DeliveryBatch {
  return deliveryMatches(batch, scope, text, targets, intent)
    ? { ...batch, delivered: new Set(batch.delivered) }
    : { ...scope, text, targets, requestId, intent, delivered: new Set() };
}

export function assertSendScope(activeRunId: string, requested: SendScope) {
  if (activeRunId !== requested.runId)
    throw new Error('The run changed. Review your draft and send it as a new message.');
}

type CatalogRefreshOptions = {
  runId: string;
  revision: number;
  load: () => Promise<ScopedCatalog>;
  apply: (catalog: ScopedCatalog) => void;
  fail: (error: unknown) => void;
};

export class CatalogRefresh {
  private latest: number;
  private attempted: number;
  private running = false;
  private closed = false;
  private readonly options: CatalogRefreshOptions;
  constructor(options: CatalogRefreshOptions) {
    this.options = options;
    this.latest = options.revision;
    this.attempted = options.revision;
  }
  observe(revision: number) {
    this.latest = Math.max(this.latest, revision);
    if (!this.closed && !this.running && this.attempted < this.latest) void this.refresh();
  }
  close() {
    this.closed = true;
  }
  private async refresh() {
    this.running = true;
    try {
      while (!this.closed && this.attempted < this.latest) {
        const requested = this.latest;
        this.attempted = requested;
        const catalog = await this.options.load();
        if (this.closed) return;
        if (catalog.runId !== this.options.runId)
          throw new Error('The agent directory belongs to another run. Reconnect to continue.');
        if (catalog.revision < this.latest) {
          if (requested === this.latest)
            throw new Error('The agent directory is out of date. Reconnect to continue.');
          continue;
        }
        this.latest = catalog.revision;
        this.attempted = catalog.revision;
        this.options.apply(catalog);
      }
    } catch (error) {
      if (!this.closed) this.options.fail(error);
    } finally {
      this.running = false;
      if (!this.closed && this.attempted < this.latest) void this.refresh();
    }
  }
}
