"use client";

import { useCallback, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  SPEC_DATA_PART,
  SPEC_DATA_PART_TYPE,
  type SpecDataPart,
} from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
import {
  ArrowUp,
  Bug,
  ChevronRight,
  FilePen,
  FilePlus,
  FileText,
  FolderGit2,
  FolderSearch,
  FolderTree,
  Gauge,
  Globe,
  Hammer,
  ListChecks,
  Loader2,
  Search,
  SquareChevronRight,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

import { ReportRenderer } from "@/lib/render/renderer";
import {
  AGENT_IDS,
  AGENTS,
  type AgentId,
  DEFAULT_AGENT_ID,
} from "@/lib/agents";

type AppDataParts = { [SPEC_DATA_PART]: SpecDataPart };
type AppMessage = UIMessage<unknown, AppDataParts>;

const transport = new DefaultChatTransport({ api: "/api/agent" });

const SUGGESTIONS: Array<{
  label: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
}> = [
  {
    label: "Build & test a library",
    description: "Scaffold a TS package with vitest and run the suite.",
    icon: Hammer,
    prompt:
      "Scaffold a tiny TypeScript semver-parsing library with vitest tests, run the tests, and report the results.",
  },
  {
    label: "Fix failing code",
    description: "Plant a subtle bug, then debug it end to end.",
    icon: Bug,
    prompt:
      "Create a small JS module with a subtle off-by-one bug and a failing test, then diagnose and fix it like a real debugging session.",
  },
  {
    label: "Benchmark something",
    description: "Measure two approaches and chart the numbers.",
    icon: Gauge,
    prompt:
      "Write and run a quick benchmark comparing JSON.parse vs a streaming JSON parser on a 5MB file, and report the numbers as a bar chart.",
  },
  {
    label: "Explore a repo",
    description: "Clone a project and map out what each part does.",
    icon: FolderGit2,
    prompt:
      "Clone github.com/vercel-labs/json-render, explore the package structure, and report what each package does.",
  },
];

/** Per-tool icon + readable [running, done] labels (labels used for a11y). */
const TOOL_META: Record<
  string,
  { icon: LucideIcon; labels: [string, string] }
> = {
  bash: {
    icon: SquareChevronRight,
    labels: ["Running command", "Ran command"],
  },
  read: { icon: FileText, labels: ["Reading file", "Read file"] },
  write: { icon: FilePlus, labels: ["Writing file", "Wrote file"] },
  edit: { icon: FilePen, labels: ["Editing file", "Edited file"] },
  grep: { icon: Search, labels: ["Searching code", "Searched code"] },
  glob: { icon: FolderSearch, labels: ["Listing files", "Listed files"] },
  ls: { icon: FolderTree, labels: ["Listing directory", "Listed directory"] },
  webSearch: { icon: Globe, labels: ["Searching the web", "Searched the web"] },
  WebFetch: { icon: Globe, labels: ["Fetching page", "Fetched page"] },
  TodoWrite: { icon: ListChecks, labels: ["Updating plan", "Updated plan"] },
};

/** Pull a one-line human hint out of a tool input (command, path, query). */
function toolInputHint(input: unknown): string | null {
  if (input == null || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const hint =
    record.command ?? record.file_path ?? record.pattern ?? record.query;
  return typeof hint === "string" ? hint : null;
}

function ToolCallDisplay({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading =
    state !== "output-available" &&
    state !== "output-error" &&
    state !== "output-denied";
  const meta = TOOL_META[toolName];
  const Icon = meta?.icon ?? Wrench;
  const label = meta ? meta.labels[isLoading ? 0 : 1] : toolName;
  const hint = toolInputHint(input);

  return (
    <div className="group rounded-lg border bg-card px-3 py-2 text-sm shadow-subtle">
      <button
        type="button"
        title={label}
        aria-label={label}
        className="flex w-full max-w-full items-center gap-2 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <Icon
          className={`size-3.5 shrink-0 text-muted-foreground ${
            isLoading && !hint ? "animate-pulse" : ""
          }`}
          strokeWidth={1.75}
        />
        {hint && (
          <code
            className={`truncate font-mono text-xs text-muted-foreground/70 ${
              isLoading ? "animate-shimmer" : ""
            }`}
          >
            {hint}
          </code>
        )}
        {!isLoading && output != null && (
          <ChevronRight
            className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:text-muted-foreground ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </button>
      {expanded && !isLoading && output != null && (
        <pre className="mt-2 max-h-64 overflow-auto border-t pt-2 text-xs text-muted-foreground whitespace-pre-wrap break-all">
          {typeof output === "string"
            ? output
            : JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Monochrome agent marks. Claude (svgl) and OpenAI (svgl) are single-path
 * brand glyphs forced to `currentColor`; Pi uses its namesake π since it has
 * no published logo. All inherit the surrounding text color.
 */
type MarkProps = { className?: string };

function ClaudeMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 256 257" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
      />
    </svg>
  );
}

function OpenAIMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 256 260" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"
      />
    </svg>
  );
}

function PiMark({ className }: MarkProps) {
  // pi.dev/logo-auto.svg — blocky "Pi" mark. The viewBox is padded a little
  // past the mark's bounds so it reads slightly smaller than the other marks.
  return (
    <svg
      viewBox="120 120 560 560"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

const AGENT_MARKS: Record<AgentId, (props: MarkProps) => React.ReactNode> = {
  "claude-code": ClaudeMark,
  codex: OpenAIMark,
  pi: PiMark,
};

/** Segmented control for picking the coding agent before a chat starts. */
function AgentSelector({
  value,
  onChange,
}: {
  value: AgentId;
  onChange: (id: AgentId) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
      {AGENT_IDS.map((id) => {
        const Mark = AGENT_MARKS[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={value === id}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              value === id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mark className="h-3.5 w-3.5" />
            {AGENTS[id].label}
          </button>
        );
      })}
    </div>
  );
}

/** Shimmering status line shown while we wait for the agent to produce output. */
function PendingLine({ label }: { label: string }) {
  return (
    <div className="text-sm text-muted-foreground animate-shimmer">{label}</div>
  );
}

function MessageBubble({
  message,
  isLast,
  isStreaming,
  pendingLabel,
}: {
  message: AppMessage;
  isLast: boolean;
  isStreaming: boolean;
  pendingLabel: string;
}) {
  const { spec, text, hasSpec } = useJsonRenderMessage(message.parts);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-foreground px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-background">
          {text}
        </div>
      </div>
    );
  }

  // Ordered segments: adjacent text merged, adjacent tool calls grouped,
  // the spec rendered inline where the agent emitted it.
  const segments: Array<
    | { kind: "text"; text: string }
    | {
        kind: "tools";
        tools: Array<{
          toolCallId: string;
          toolName: string;
          state: string;
          input: unknown;
          output: unknown;
        }>;
      }
    | { kind: "spec" }
  > = [];
  let specInserted = false;

  for (const part of message.parts) {
    if (part.type === "text") {
      if (!part.text.trim()) continue;
      const last = segments[segments.length - 1];
      if (last?.kind === "text") last.text += part.text;
      else segments.push({ kind: "text", text: part.text });
    } else if (part.type.startsWith("tool-")) {
      const tp = part as {
        type: string;
        toolCallId: string;
        state: string;
        input?: unknown;
        output?: unknown;
      };
      const tool = {
        toolCallId: tp.toolCallId,
        toolName: tp.type.replace(/^tool-/, ""),
        state: tp.state,
        input: tp.input,
        output: tp.output,
      };
      const last = segments[segments.length - 1];
      if (last?.kind === "tools") last.tools.push(tool);
      else segments.push({ kind: "tools", tools: [tool] });
    } else if (part.type === SPEC_DATA_PART_TYPE && !specInserted) {
      segments.push({ kind: "spec" });
      specInserted = true;
    }
  }

  const showLoader = isLast && isStreaming && segments.length === 0 && !hasSpec;

  return (
    <div className="flex w-full flex-col gap-3">
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return (
            <div key={`text-${i}`} className="markdown text-sm leading-relaxed">
              <Streamdown
                plugins={{ code }}
                animated={isLast && isStreaming && i === segments.length - 1}
              >
                {seg.text}
              </Streamdown>
            </div>
          );
        }
        if (seg.kind === "spec") {
          if (!hasSpec) return null;
          return (
            <div key="spec" className="w-full">
              <ReportRenderer spec={spec} loading={isLast && isStreaming} />
            </div>
          );
        }
        return (
          <div key={`tools-${i}`} className="flex flex-col gap-1.5">
            {seg.tools.map((t) => (
              <ToolCallDisplay
                key={t.toolCallId}
                toolName={t.toolName}
                state={t.state}
                input={t.input}
                output={t.output}
              />
            ))}
          </div>
        );
      })}

      {showLoader && <PendingLine label={pendingLabel} />}

      {hasSpec && !specInserted && (
        <div className="w-full">
          <ReportRenderer spec={spec} loading={isLast && isStreaming} />
        </div>
      )}
    </div>
  );
}

export default function HarnessChatPage() {
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState<AgentId>(DEFAULT_AGENT_ID);
  const [chatId, setChatId] = useState(() => crypto.randomUUID());
  const [isResetting, setIsResetting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, setMessages, status, error, id, stop } =
    useChat<AppMessage>({ transport, id: chatId });

  const isStreaming = status === "streaming" || status === "submitted";
  const isBusy = isStreaming || isResetting;

  const handleSubmit = useCallback(
    async (text?: string) => {
      const message = text || input;
      if (!message.trim() || isBusy) return;
      setInput("");
      // The server locks the agent to the chat on the first message; sending
      // it every turn is harmless and keeps follow-ups consistent.
      await sendMessage({ text: message.trim() }, { body: { agent: agentId } });
    },
    [input, isBusy, sendMessage, agentId],
  );

  const handleClear = useCallback(async () => {
    if (isResetting) return;
    setIsResetting(true);
    stop();

    // Drop the server-side harness session (and its sandbox) for this chat.
    try {
      await fetch(`/api/agent?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } finally {
      setMessages([]);
      setChatId(crypto.randomUUID());
      setInput("");
      setIsResetting(false);
      inputRef.current?.focus();
    }
  }, [id, isResetting, setMessages, stop]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* The header only appears once a chat has started; the first screen is
          headerless so the brand title carries it. */}
      {!isEmpty && (
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-5 backdrop-blur-md">
          {/* Left: active agent */}
          {(() => {
            const Mark = AGENT_MARKS[agentId];
            return (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mark className="h-3.5 w-3.5" />
                {AGENTS[agentId].label}
              </span>
            );
          })()}
          {/* Center: brand, absolutely centered so side widths can't shift it */}
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-medium tracking-tight whitespace-nowrap text-muted-foreground">
            AI SDK <span className="font-mono">HarnessAgent</span>
            <span className="mx-1.5 font-normal">+</span>
            <span className="font-mono">json-render</span>
          </h1>
          {/* Right: reset */}
          <button
            onClick={handleClear}
            disabled={isResetting}
            className="-mr-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start over
          </button>
        </header>
      )}

      <main className="flex flex-1 flex-col overflow-auto">
        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="w-full max-w-3xl">
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight">
                  AI SDK <span className="font-mono">HarnessAgent</span>
                  <span className="mx-1.5 font-normal text-muted-foreground">
                    +
                  </span>
                  <span className="font-mono">json-render</span>
                </h2>
                <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
                  A coding agent works in a live sandbox, then reports back as
                  rendered UI — steps, diffs, terminal output, tests, and charts
                  — instead of a wall of markdown.
                </p>
              </div>
              <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      onClick={() => handleSubmit(s.prompt)}
                      disabled={isBusy}
                      className="group flex items-start gap-3 bg-card p-4 text-left transition-colors hover:bg-accent"
                    >
                      <Icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block text-sm font-medium tracking-tight">
                          {s.label}
                        </span>
                        <span className="block text-[13px] leading-snug text-muted-foreground">
                          {s.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                isStreaming={isStreaming}
                pendingLabel={index <= 1 ? "Starting sandbox…" : "Working…"}
              />
            ))}
            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <PendingLine
                label={messages.length <= 1 ? "Starting sandbox…" : "Working…"}
              />
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error.message}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="shrink-0 px-6 pb-5">
        {isEmpty && (
          <div className="mx-auto mb-2.5 flex max-w-3xl items-center gap-2">
            <span className="text-xs text-muted-foreground">Agent</span>
            <AgentSelector value={agentId} onChange={setAgentId} />
          </div>
        )}
        <div className="group relative mx-auto max-w-3xl rounded-xl border bg-card shadow-subtle transition-colors focus-within:border-ring">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              isEmpty
                ? "Scaffold a TypeScript library and run its tests…"
                : "Ask a follow-up…"
            }
            rows={2}
            className="w-full resize-none bg-transparent px-3.5 py-3 pr-12 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none"
            autoFocus
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isBusy}
            className="absolute right-2.5 bottom-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-25"
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
