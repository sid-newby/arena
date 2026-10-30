import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { isEffort, type ProviderCatalog, type ProviderId } from '../runs/run.contract.js';
import { CodexClient } from './codex-client.js';
import { assertAnthropicSubscription } from './anthropic-auth.js';
import { protocolObject, providerEnvironment } from './provider-environment.js';

type ProviderModel = ProviderCatalog['models'][number];

async function codexModels(): Promise<ProviderModel[]> {
  const client = new CodexClient();
  try {
    await client.initialize();
    const models: ProviderModel[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.request('model/list', {
        limit: 100,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      if (!Array.isArray(result.data)) throw new Error('Codex returned an invalid model catalog.');
      for (const value of result.data) {
        const model = protocolObject(value);
        if (
          typeof model.model !== 'string' ||
          typeof model.displayName !== 'string' ||
          !Array.isArray(model.supportedReasoningEfforts)
        )
          throw new Error('Codex returned invalid model capabilities.');
        const efforts = model.supportedReasoningEfforts
          .map((entry: unknown) => protocolObject(entry).reasoningEffort)
          .filter(isEffort);
        models.push({ id: model.model, name: model.displayName, efforts });
      }
      if (
        result.nextCursor !== null &&
        result.nextCursor !== undefined &&
        typeof result.nextCursor !== 'string'
      )
        throw new Error('Codex returned an invalid model cursor.');
      cursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
    } while (cursor);
    return models;
  } finally {
    client.close();
  }
}

async function anthropicModels(): Promise<ProviderModel[]> {
  const controller = new AbortController();
  async function* input(): AsyncGenerator<SDKUserMessage> {
    if (!controller.signal.aborted)
      await new Promise<void>((resolve) =>
        controller.signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    yield* [];
  }

  const session = query({
    prompt: input(),
    options: {
      env: providerEnvironment(),
      abortController: controller,
      tools: [],
      strictMcpConfig: true,
      settingSources: [],
      permissionMode: 'dontAsk',
    },
  });
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    assertAnthropicSubscription(await session.accountInfo());
    const models = await session.supportedModels();
    const unique = new Map<string, ProviderModel>();
    for (const model of models) {
      const id = model.resolvedModel ?? model.value;
      unique.set(id, {
        id,
        name: model.displayName,
        efforts: (model.supportedEffortLevels ?? []).filter(isEffort),
      });
    }
    return [...unique.values()];
  } finally {
    clearTimeout(timeout);
    controller.abort();
    session.close();
  }
}

export async function discoverModels(provider: ProviderId): Promise<ProviderCatalog> {
  try {
    const models = provider === 'codex' ? await codexModels() : await anthropicModels();
    return { provider, status: 'ready', models };
  } catch (error) {
    return {
      provider,
      status: 'unavailable',
      models: [],
      reason: error instanceof Error ? error.message : 'Provider discovery failed.',
    };
  }
}
