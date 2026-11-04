import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";

export const maxDuration = 60;

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function POST(req: Request) {
  const { prompt, systemPrompt } = await req.json();

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  try {
    const result = streamText({
      model: gateway(DEFAULT_MODEL),
      system: systemPrompt ?? "You are a helpful UI builder.",
      prompt,
      temperature: 0.7,
    });

    const response = result.toTextStreamResponse();

    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS_HEADERS });
}
