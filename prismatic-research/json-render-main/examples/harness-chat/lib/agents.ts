/**
 * Agent catalog — client-safe metadata shared by the UI selector and the
 * server route. Kept free of server-only imports (harness/sandbox SDKs) so it
 * can be imported from client components without leaking those into the bundle.
 * The actual harness construction lives in `lib/agent.ts`.
 */
export const AGENTS = {
  "claude-code": { label: "Claude Code" },
  codex: { label: "Codex" },
  pi: { label: "Pi" },
} as const;

export type AgentId = keyof typeof AGENTS;

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export const DEFAULT_AGENT_ID: AgentId = "claude-code";

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && value in AGENTS;
}
