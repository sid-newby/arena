import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentSession,
} from "@ai-sdk/harness/agent";
import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { createCodex } from "@ai-sdk/harness-codex";
import { createPi } from "@ai-sdk/harness-pi";
import { createVercelSandbox } from "@ai-sdk/sandbox-vercel";
import { agentReportCatalog } from "./render/catalog";
import { type AgentId } from "./agents";

const AGENT_INSTRUCTIONS = `You are a coding agent running inside a fresh Linux sandbox with Node.js available. The user gives you software tasks; you do the work with your tools (bash, file edits, web search), then report back.

REPORTING:
Your chat output is rendered in a web UI that understands a JSON component spec. After finishing the work for a turn:
1. Write one or two short conversational sentences about the outcome.
2. Then output a UI report as a JSONL spec wrapped in a \`\`\`spec fence.

Make the report reflect what actually happened, drawing from your real session:
- Steps for the plan you executed (statuses: done/error; use active/pending only if work remains).
- FileChange entries for files you created, modified, or deleted.
- Terminal for important commands you ran and their real output (trim long output).
- TestResults when you ran a test suite.
- Metric for headline numbers (files changed, tests passed, duration).
- BarChart to compare numbers across labeled categories (e.g. bundle size per module, benchmark per case).
- LineChart for a number that changes across an ordered sequence (e.g. coverage per commit, latency over runs).
- CodeBlock for the key snippet worth showing, with the file path as title.
- Callout for risks, caveats, or suggested follow-ups.
- Group sections with Card; never nest Cards.

Never invent results. If something failed, show it (error step, non-zero exit, failed tests) and say what you would try next.

Never use emojis -- not in prose, headings, labels, callouts, or any text field. The UI components supply their own icons.

${agentReportCatalog.prompt({
  mode: "inline",
  customRules: [
    "Keep reports compact and information-dense; the UI renders inside a chat thread.",
    "Prefer Grid with columns='2' or '3' for Metric rows.",
    "Use real command output captured during the session in Terminal components.",
    "Never put emojis in any text field; the components already provide icons.",
  ],
})}`;

const gatewayKey = process.env.AI_GATEWAY_API_KEY;

// Each agent runs in its own fresh Node sandbox.
const sandbox = () => createVercelSandbox({ runtime: "node24", ports: [3000] });

/**
 * Build the HarnessAgent for an agent id. Both adapters need a `as unknown`
 * cast on current canaries: they pin zod@3 while the rest of the tree resolves
 * zod@4, so their HarnessV1 type carries a different provider-utils instance.
 * Type-level only.
 */
function createAgent(id: AgentId): HarnessAgent {
  if (id === "codex") {
    const auth = gatewayKey
      ? { gateway: { apiKey: gatewayKey } }
      : process.env.OPENAI_API_KEY
        ? { openai: { apiKey: process.env.OPENAI_API_KEY } }
        : undefined;
    return new HarnessAgent({
      harness: createCodex({
        auth,
        model: process.env.CODEX_MODEL,
      }) as unknown as HarnessAgentAdapter,
      sandbox: sandbox(),
      instructions: AGENT_INSTRUCTIONS,
    });
  }

  if (id === "pi") {
    // Pi reads gateway credentials from process.env when auth is omitted; we
    // pass it explicitly when set for parity with the other agents.
    return new HarnessAgent({
      harness: createPi({
        auth: gatewayKey ? { gateway: { apiKey: gatewayKey } } : undefined,
        model: process.env.PI_MODEL,
      }) as unknown as HarnessAgentAdapter,
      sandbox: sandbox(),
      instructions: AGENT_INSTRUCTIONS,
    });
  }

  const auth = gatewayKey
    ? { gateway: { apiKey: gatewayKey } }
    : process.env.ANTHROPIC_API_KEY
      ? { anthropic: { apiKey: process.env.ANTHROPIC_API_KEY } }
      : undefined;
  return new HarnessAgent({
    harness: createClaudeCode({
      auth,
      model: process.env.CLAUDE_CODE_MODEL,
    }) as unknown as HarnessAgentAdapter,
    sandbox: sandbox(),
    instructions: AGENT_INSTRUCTIONS,
  });
}

// One HarnessAgent instance per agent id, built lazily and reused.
const agents = new Map<AgentId, HarnessAgent>();
function getAgent(id: AgentId): HarnessAgent {
  let agent = agents.get(id);
  if (!agent) {
    agent = createAgent(id);
    agents.set(id, agent);
  }
  return agent;
}

/**
 * One live harness session per chat. A session owns the sandbox and the
 * runtime's own conversation history, so follow-up messages in the same chat
 * keep working against the same workspace. The session is bound to the agent
 * that created it, so the chosen agent is locked for the life of the chat.
 *
 * In-memory only -- fine for a dev-server example. A production app would
 * persist `session.detach()` state and resume by sessionId instead.
 */
type SessionEntry = {
  session: HarnessAgentSession;
  agent: HarnessAgent;
  agentId: AgentId;
  expireTimer: NodeJS.Timeout;
};

const sessions = new Map<string, SessionEntry>();

const SESSION_IDLE_MS = 10 * 60 * 1000;

export async function getSession(
  chatId: string,
  agentId: AgentId,
): Promise<SessionEntry> {
  const existing = sessions.get(chatId);
  if (existing) {
    existing.expireTimer.refresh();
    return existing;
  }

  const agent = getAgent(agentId);
  const session = await agent.createSession();
  const expireTimer = setTimeout(() => {
    sessions.delete(chatId);
    session.destroy().catch(() => {});
  }, SESSION_IDLE_MS);
  expireTimer.unref?.();
  const entry: SessionEntry = { session, agent, agentId, expireTimer };
  sessions.set(chatId, entry);
  return entry;
}

export function dropSession(chatId: string): void {
  const entry = sessions.get(chatId);
  if (!entry) return;
  clearTimeout(entry.expireTimer);
  sessions.delete(chatId);
  entry.session.destroy().catch(() => {});
}
