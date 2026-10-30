import { UnconfirmedCancellationError } from './runtime-cancellation.js';
import { anthropicUsage } from '../state/provider-usage.js';
import {
  createSdkMcpServer,
  query,
  tool,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import {
  DEFAULT_MODELS,
  type ParticipantRole,
  type ProviderConfig,
  type SeatId,
} from '../runs/run.contract.js';
import type { AgentRuntime, TurnContext } from './chat.types.js';
import { runCodex, codexReady } from './codex.runtime.js';
import { providerEnvironment } from '../providers/provider-environment.js';
import { runtimeInstructions, runtimeTools, toolInputSchema } from './runtime-tools.js';
import {
  anthropicReady,
  assertAnthropicSubscription,
  anthropicEffort,
} from '../providers/anthropic-auth.js';
export { discoverModels } from '../providers/provider-capabilities.js';

export async function runAnthropic(
  context: TurnContext,
  workspace: string,
  selection: ProviderConfig,
  role: ParticipantRole,
) {
  const definitions = context.tools ?? runtimeTools(role);
  const server = createSdkMcpServer({
    name: 'room',
    version: '2.0.0',
    tools: definitions.map((definition) => {
      const schema = toolInputSchema(definition);
      return tool(
        definition.name,
        definition.description,
        schema.shape,
        async (argumentsValue) => ({
          content: [
            {
              type: 'text',
              text: await context.tool(definition.name, schema.parse(argumentsValue)),
            },
          ],
        }),
      );
    }),
  });
  let releaseInput!: () => void;
  let authorizedToSend = false;
  const authorized = new Promise<void>((resolve) => {
    releaseInput = resolve;
  });
  async function* input(): AsyncGenerator<SDKUserMessage> {
    await authorized;
    if (authorizedToSend && !context.controller.signal.aborted)
      yield {
        type: 'user',
        message: { role: 'user', content: context.text },
        parent_tool_use_id: null,
      };
  }
  const session = query({
    prompt: input(),
    options: {
      model: selection.model,
      effort: anthropicEffort(selection.effort),
      cwd: workspace,
      env: providerEnvironment(),
      systemPrompt: context.instructions ?? runtimeInstructions(role),
      resume: context.session,

      includePartialMessages: true,
      tools: context.mode === 'side' ? [] : ['WebSearch', 'WebFetch'],
      mcpServers:
        context.mode === 'side'
          ? {}
          : { room: server, context7: { type: 'http', url: 'https://mcp.context7.com/mcp' } },
      strictMcpConfig: true,
      settingSources: [],
      allowedTools:
        context.mode === 'side'
          ? []
          : [
              ...definitions.map((definition) => `mcp__room__${definition.name}`),
              'WebSearch',
              'WebFetch',
              'mcp__context7__resolve-library-id',
              'mcp__context7__query-docs',
            ],
      permissionMode: 'dontAsk',
      canUseTool: async () => ({
        behavior: 'deny',
        message: 'Only supplied room tools are authorized.',
      }),
      maxTurns: 16,
    },
  });
  let completed = false,
    terminalSeen = false;
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    if (!authorizedToSend) return;
    void session.interrupt().catch(() => session.close());
    cancellationTimer = setTimeout(() => session.close(), 5000);
  };
  context.controller.signal.addEventListener('abort', abort, { once: true });
  try {
    context.controller.signal.throwIfAborted();
    assertAnthropicSubscription(await session.accountInfo());
    context.controller.signal.throwIfAborted();
    authorizedToSend = true;
    releaseInput();
    for await (const message of session) {
      if (message.type === 'system' && message.subtype === 'init') {
        if (message.model !== selection.model)
          throw new Error(`Unexpected Claude model ${message.model}; expected ${selection.model}.`);
        context.saveSession(message.session_id);
      }
      if (message.type === 'system' && message.subtype === 'model_refusal_fallback')
        throw new Error(
          `Claude changed models from ${message.original_model} to ${message.fallback_model}; this run does not permit fallback.`,
        );
      if (message.type === 'assistant' && message.message.model !== selection.model)
        throw new Error(
          `Unexpected Claude response model ${message.message.model}; expected ${selection.model}.`,
        );
      if (
        message.type === 'stream_event' &&
        message.event.type === 'message_start' &&
        message.event.message.model !== selection.model
      )
        throw new Error(
          `Unexpected Claude stream model ${message.event.message.model}; expected ${selection.model}.`,
        );
      if (
        message.type === 'stream_event' &&
        message.event.type === 'content_block_delta' &&
        message.event.delta.type === 'text_delta'
      )
        context.append(message.event.delta.text);
      if (message.type === 'result') {
        terminalSeen = true;
        for (const observation of anthropicUsage(message, selection.model))
          context.usage?.(observation);
        if (message.subtype !== 'success' || message.is_error)
          throw new Error(
            message.subtype === 'success' ? message.result : message.errors.join('\n'),
          );
        if (
          'terminal_reason' in message &&
          message.terminal_reason &&
          message.terminal_reason !== 'completed' &&
          !context.controller.signal.aborted
        )
          throw new Error('Claude reply ended before natural completion.');
        completed = true;
      }
    }
    if (context.controller.signal.aborted && authorizedToSend && !terminalSeen)
      throw new UnconfirmedCancellationError();
    if (!completed && !context.controller.signal.aborted)
      throw new Error('Claude stream ended before completion.');
  } catch (error) {
    if (context.controller.signal.aborted && authorizedToSend && !terminalSeen)
      throw new UnconfirmedCancellationError();
    throw error;
  } finally {
    clearTimeout(cancellationTimer);
    context.controller.signal.removeEventListener('abort', abort);
    releaseInput();
    session.close();
  }
}

export function createParticipantRuntime(
  role: ParticipantRole,
  selection: ProviderConfig,
  workspace: string,
): AgentRuntime {
  const ready = selection.provider === 'codex' ? codexReady() : anthropicReady();
  const reason =
    selection.provider === 'codex'
      ? 'Sign in to your ChatGPT subscription with codex login.'
      : 'Sign in to your Claude subscription with claude auth login.';
  return {
    info: {
      id: role,
      name: role === 'maestro' ? 'Maestro' : role.toUpperCase(),
      provider: selection.provider,
      model: selection.model,
      effort: selection.effort,
      runtime: selection.provider === 'codex' ? 'Codex · ChatGPT plan' : 'Claude · subscription',
      status: ready ? 'ready' : 'unavailable',
      ...(!ready ? { reason } : {}),
    },
    run: (context) =>
      selection.provider === 'codex'
        ? runCodex(context, workspace, selection, role)
        : runAnthropic(context, workspace, selection, role),
  };
}

export function createRuntimes(
  workspace: string,
  selections: Record<SeatId, ProviderConfig> = {
    a: DEFAULT_MODELS.a,
    b: DEFAULT_MODELS.b,
  },
): Record<SeatId, AgentRuntime> {
  return {
    a: createParticipantRuntime('a', selections.a, workspace),
    b: createParticipantRuntime('b', selections.b, workspace),
  };
}
