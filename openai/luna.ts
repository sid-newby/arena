import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { stdin, stdout, stderr } from "node:process";
import { fileURLToPath } from "node:url";

const settings = {
  model: "gpt-6-luna",
  systemPrompt: "You are an Agent.",
  serviceTier: "default",
  reasoningEffort: "high",
  reasoningSummary: "auto",
  verbosity: "medium",
  webSearch: "live",
  imageGeneration: true,
  sandbox: "workspace-write",
  workingDirectory: fileURLToPath(new URL(".", import.meta.url)),
};

const codexBin = process.env.CODEX_BIN || "codex";
const raw = process.argv.includes("--json");

type ObjectValue = Record<string, unknown>;
type Pending = { resolve: (value: ObjectValue) => void; reject: (error: Error) => void };

class ChatClosed extends Error {}

function object(value: unknown): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid object received from Codex.");
  }
  return value as ObjectValue;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const status = spawnSync(codexBin, ["login", "status"], { encoding: "utf8" });
  if (status.error) throw new Error(`Cannot launch ${codexBin}. Install Codex CLI or set CODEX_BIN.`);
  if (status.status !== 0) {
    stderr.write("Sign in with ChatGPT in the browser. Codex handles the localhost callback.\n");
    const login = spawnSync(codexBin, ["login"], { stdio: "inherit" });
    if (login.status !== 0) throw new Error("Codex login did not complete. Run codex login and try again.");
  } else if (!status.stderr.includes("ChatGPT") && !status.stdout.includes("ChatGPT")) {
    throw new Error("Codex is using another auth method. Run codex login to sign in with ChatGPT.");
  }

  const server = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let activeTurn: Pending | undefined;
  let terminal: ReturnType<typeof createInterface> | undefined;
  const stopped = new AbortController();

  function stop(error = new ChatClosed("Chat closed.")) {
    if (stopped.signal.aborted) return;
    stopped.abort(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    activeTurn?.reject(error);
    activeTurn = undefined;
    terminal?.close();
    server.stdin.destroy();
    server.kill();
    const force = setTimeout(() => server.kill("SIGKILL"), 1_000);
    force.unref();
  }

  function send(value: ObjectValue) {
    if (stopped.signal.aborted) throw stopped.signal.reason;
    server.stdin.write(`${JSON.stringify(value)}\n`);
  }

  function rpc(method: string, params: ObjectValue): Promise<ObjectValue> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex timed out responding to ${method}.`));
      }, 30_000);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { send({ id, method, params }); }
      catch (error) { pending.get(id)?.reject(new Error(message(error))); pending.delete(id); }
    });
  }

  const lines = createInterface({ input: server.stdout });
  lines.on("line", (line) => {
    try {
      const incoming = object(JSON.parse(line));
      if (typeof incoming.id === "number" && typeof incoming.method !== "string") {
        const request = pending.get(incoming.id);
        if (!request) return;
        if (incoming.error) request.reject(new Error(String(object(incoming.error).message)));
        else request.resolve(object(incoming.result));
        pending.delete(incoming.id);
        return;
      }
      if (typeof incoming.method !== "string") throw new Error("Invalid Codex RPC message.");
      if ("id" in incoming) {
        send({ id: incoming.id, error: { code: -32601, message: "This minimal client does not handle interactive tool requests." } });
        stderr.write(`\n[Unsupported request: ${incoming.method}]\n`);
        return;
      }
      const params = object(incoming.params ?? {});
      if (raw) stdout.write(`${line}\n`);
      if (incoming.method === "item/agentMessage/delta" && typeof params.delta === "string" && !raw) {
        stdout.write(params.delta);
      }
      if (incoming.method === "item/started" && !raw) {
        const item = object(params.item);
        if (item.type === "commandExecution") stderr.write(`\n[shell] ${item.command}\n`);
        if (item.type === "webSearch") stderr.write("\n[web search]\n");
        if (item.type === "imageGeneration") stderr.write("\n[generating image]\n");
      }
      if (incoming.method === "item/completed" && !raw) {
        const item = object(params.item);
        if (item.type === "imageGeneration") {
          if (item.failure || item.status === "failed") {
            stderr.write(`\n[image failed] ${JSON.stringify(item.failure ?? item.status)}\n`);
          } else {
            stderr.write(`\n[image] ${item.savedPath ?? "Completed; use --json to inspect the result."}\n`);
          }
        }
      }
      if (incoming.method === "error") {
        stderr.write(`\n[Codex] ${object(params.error).message}\n`);
      }
      if (incoming.method === "turn/completed") {
        const turn = object(params.turn);
        const waiting = activeTurn;
        activeTurn = undefined;
        if (turn.status === "failed") {
          waiting?.reject(new Error(turn.error ? String(object(turn.error).message) : "Turn failed."));
        } else waiting?.resolve(turn);
      }
    } catch (error) { stop(new Error(`Codex protocol error: ${message(error)}`)); }
  });
  server.on("error", (error) => stop(error));
  server.stdin.on("error", (error) => stop(error));
  server.on("exit", (code, signal) => stop(new Error(`Codex exited (${signal ?? code}).`)));
  lines.on("close", () => stop(new Error("Codex disconnected.")));
  const interrupt = () => stop();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);

  try {
    await rpc("initialize", {
      clientInfo: { name: "luna_terminal", title: "Luna terminal chat", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    send({ method: "initialized", params: {} });
    const result = await rpc("thread/start", {
      model: settings.model,
      allowProviderModelFallback: false,
      modelProvider: "openai",
      serviceTier: settings.serviceTier,
      baseInstructions: settings.systemPrompt,
      cwd: settings.workingDirectory,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: settings.sandbox,
      config: {
        model_verbosity: settings.verbosity,
        web_search: settings.webSearch,
        "features.image_generation": settings.imageGeneration,
        "features.multi_agent": false,
      },
    });
    const threadId = object(result.thread).id;
    if (typeof threadId !== "string") throw new Error("Codex returned no thread ID.");
    if (result.model !== settings.model) throw new Error(`Codex selected ${result.model} instead of ${settings.model}.`);

    terminal = createInterface({ input: stdin, output: stderr, terminal: Boolean(stdin.isTTY) });
    terminal.on("SIGINT", interrupt);
    terminal.on("close", () => stop());
    stderr.write(`Luna (${settings.model}). /exit, Ctrl-C, or Ctrl-D to leave.\n`);
    terminal.setPrompt("\nyou> ");
    terminal.prompt();
    for await (const line of terminal) {
      const input = line.trim();
      if (["/exit", "/quit"].includes(input)) break;
      if (!input) { terminal.prompt(); continue; }
      if (!raw) stdout.write("\nluna> ");
      const completion = Promise.withResolvers<ObjectValue>();
      activeTurn = completion;
      try {
        await Promise.all([
          rpc("turn/start", {
            threadId,
            input: [{ type: "text", text: input, text_elements: [] }],
            effort: settings.reasoningEffort,
            summary: settings.reasoningSummary,
          }),
          completion.promise,
        ]);
      } catch (error) {
        if (stopped.signal.aborted) throw stopped.signal.reason;
        throw error;
      }
      stdout.write("\n");
      terminal.prompt();
    }
    if (stopped.signal.aborted) throw stopped.signal.reason;
  } finally {
    stop();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}

main().catch((error: unknown) => {
  if (error instanceof ChatClosed) return;
  stderr.write(`\n${message(error)}\n`);
  process.exitCode = 1;
});
