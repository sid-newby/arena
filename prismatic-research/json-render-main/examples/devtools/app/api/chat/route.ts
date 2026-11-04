import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { pipeJsonRender } from "@json-render/core";
import { createAgent } from "@/lib/agent";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "Missing AI_GATEWAY_API_KEY",
        message:
          "Set AI_GATEWAY_API_KEY in .env.local to enable AI. See https://vercel.com/ai-gateway.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = (await req.json()) as {
    messages: UIMessage[];
    messageId?: string;
  };

  if (!body.messages?.length) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // The client generates a stable messageId per turn so the agent can
  // namespace state paths and element keys. Fall back to a random id.
  const messageId =
    body.messageId ?? `m${Math.random().toString(36).slice(2, 8)}`;

  const agent = createAgent(messageId);
  const modelMessages = await convertToModelMessages(body.messages);
  const result = await agent.stream({ messages: modelMessages });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
