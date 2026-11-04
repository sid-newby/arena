import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { getSession, dropSession } from "@/lib/agent";
import { DEFAULT_AGENT_ID, isAgentId } from "@/lib/agents";

// Harness turns are long: the agent boots a sandbox, edits files, and runs
// commands before answering.
export const maxDuration = 600;

function lastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json();
  const chatId: string = body.id ?? "default";
  const messages: UIMessage[] = body.messages ?? [];

  const prompt = lastUserText(messages);
  if (!prompt) {
    return new Response(
      JSON.stringify({ error: "a user message with text is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // The agent is chosen on the first message and locked for the chat: an
  // existing session ignores `body.agent` and keeps its original agent.
  const requestedAgent = isAgentId(body.agent) ? body.agent : DEFAULT_AGENT_ID;

  // The harness session owns its own conversation history, so each turn
  // sends only the fresh user input -- not the whole transcript.
  const { session, agent } = await getSession(chatId, requestedAgent);
  const result = await agent.stream({ prompt, session });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("id") ?? "default";
  dropSession(chatId);
  return new Response(null, { status: 204 });
}
