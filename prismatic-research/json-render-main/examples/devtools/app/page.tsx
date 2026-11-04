"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  SPEC_DATA_PART,
  type SpecDataPart,
  type Spec,
} from "@json-render/core";
import {
  JSONUIProvider,
  Renderer,
  buildSpecFromParts,
  useJsonRenderMessage,
  useStateStore,
} from "@json-render/react";
import { JsonRenderDevtools } from "@json-render/devtools-react";
import { registry } from "@/lib/registry";
import { catalog } from "@/lib/catalog";

// Shared computed helpers the AI can reference with $computed. Keeping these
// minimal avoids surprising the agent: +/-/toggle cover the most common cases.
const computedFunctions = {
  inc: (args: Record<string, unknown>) =>
    ((args.of as number | undefined) ?? 0) +
    ((args.by as number | undefined) ?? 1),
  dec: (args: Record<string, unknown>) =>
    ((args.of as number | undefined) ?? 0) -
    ((args.by as number | undefined) ?? 1),
  toggle: (args: Record<string, unknown>) => !(args.of as boolean | undefined),
  add: (args: Record<string, unknown>) =>
    ((args.a as number | undefined) ?? 0) +
    ((args.b as number | undefined) ?? 0),
};

// ---------------------------------------------------------------------------
// Types & transport
// ---------------------------------------------------------------------------

type AppDataParts = { [SPEC_DATA_PART]: SpecDataPart };
type AppMessage = UIMessage<unknown, AppDataParts>;

const transport = new DefaultChatTransport({ api: "/api/chat" });

const SUGGESTIONS = [
  {
    label: "Counter",
    prompt: "Build an interactive counter with +/- and reset buttons",
    blurb: "Dispatches setState actions visible in the Actions panel.",
  },
  {
    label: "Todo list",
    prompt:
      "Make a todo list where I can type a task, add it, mark it done, and remove it",
    blurb: "Shows pushState / removeState and two-way bound inputs.",
  },
  {
    label: "Dashboard",
    prompt:
      "Show me a fitness tracker with three metrics (steps, calories, sleep), progress bars, and a tip callout",
    blurb: "Metrics + progress — good State and Stream panel content.",
  },
  {
    label: "Quiz",
    prompt:
      "Quiz me on three world geography questions with checkboxes and a submit button that reveals my score",
    blurb: "Bindings + conditional visibility in the Spec panel.",
  },
];

// ---------------------------------------------------------------------------
// MessageSpecRenderer — one <Renderer /> per assistant message, all wired
// into the same top-level state store so the devtools sees everything.
// ---------------------------------------------------------------------------

function MessageSpecRenderer({ spec }: { spec: Spec }): ReactNode {
  const { update, getSnapshot } = useStateStore();
  const seeded = useRef<Set<string>>(new Set());

  // Seed the shared store with this message's initial state the first time
  // each top-level key appears. The AI is prompted to namespace every path
  // with the message id, so keys from different messages never collide.
  // We only seed keys that aren't already in the store, so live user edits
  // aren't clobbered by late-arriving patches.
  useEffect(() => {
    const branch = spec.state as Record<string, unknown> | undefined;
    if (!branch) return;
    const current = getSnapshot() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(branch)) {
      if (seeded.current.has(key)) continue;
      seeded.current.add(key);
      if (current[key] === undefined) {
        updates[`/${key}`] = value;
      }
    }
    if (Object.keys(updates).length > 0) {
      update(updates);
    }
  }, [spec.state, update, getSnapshot]);

  return (
    <div className="spec-wrap">
      <Renderer spec={spec} registry={registry} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------

function UserBubble({ text }: { text: string }) {
  return (
    <div className="row user">
      <div className="bubble user">{text}</div>
    </div>
  );
}

function AssistantBubble({
  message,
  isLast,
  isStreaming,
}: {
  message: AppMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const { spec, text, hasSpec } = useJsonRenderMessage(message.parts);
  const showThinking = isLast && isStreaming && !text && !hasSpec;

  return (
    <div className="row assistant">
      <div className="assistant-inner">
        {showThinking && <div className="thinking jr-shimmer">Thinking…</div>}
        {text && <div className="assistant-text">{text}</div>}
        {hasSpec && spec && <MessageSpecRenderer spec={spec} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="empty">
      <div className="empty-inner">
        <div className="eyebrow">json-render devtools</div>
        <h1>Chat with AI, inspect every renderer.</h1>
        <p className="lead">
          Each assistant reply streams a fresh <code>Spec</code> rendered inline
          below the message. One floating devtools panel captures every streamed
          patch, state change, and dispatched action — across every message on
          this page.
        </p>
        <div className="callout-row">
          <div className="callout">
            <div className="cap">Tip</div>
            <div>
              The panel is already open. Switch between Spec, State, Actions,
              Stream, Catalog and Pick to see what each renderer exposes.
            </div>
          </div>
          <div className="callout">
            <div className="cap">Shortcut</div>
            <div>
              Toggle the panel with <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>J</kbd> or
              click the <code>{"{}"}</code> badge.
            </div>
          </div>
        </div>

        <div className="sugg-grid">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              className="sugg"
              onClick={() => onPick(s.prompt)}
            >
              <div className="sugg-label">{s.label}</div>
              <div className="sugg-prompt">{s.prompt}</div>
              <div className="sugg-blurb">{s.blurb}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Page() {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, setMessages, status, error } =
    useChat<AppMessage>({ transport });

  const isStreaming = status === "streaming" || status === "submitted";

  // The devtools Spec panel inspects one spec at a time; we show the most
  // recent assistant message's spec as a sensible default.
  const currentSpec = useMemo<Spec | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const spec = buildSpecFromParts(m.parts);
      if (spec) return spec;
    }
    return null;
  }, [messages]);

  const handleSubmit = useCallback(
    (preset?: string) => {
      const text = (preset ?? input).trim();
      if (!text || isStreaming) return;
      setInput("");
      void sendMessage({ text });
      taRef.current?.focus();
    },
    [input, isStreaming, sendMessage],
  );

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  return (
    <JSONUIProvider
      registry={registry}
      initialState={{}}
      functions={computedFunctions}
    >
      <div className="app">
        <header className="topbar">
          <div className="topbar-brand">
            <div className="logo-dot" aria-hidden />
            <div className="topbar-text">
              <div className="topbar-title">json-render devtools</div>
              <div className="topbar-sub">
                AI chat · shared state · one panel
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            {messages.length > 0 && (
              <button
                className="btn-ghost"
                onClick={() => setMessages([])}
                type="button"
              >
                Clear chat
              </button>
            )}
            <a
              className="btn-link"
              href="https://json-render.dev/docs/devtools"
              target="_blank"
              rel="noreferrer"
            >
              Docs ↗
            </a>
          </div>
        </header>

        <main ref={listRef} className="scroll">
          {messages.length === 0 ? (
            <EmptyState onPick={(p) => handleSubmit(p)} />
          ) : (
            <div className="thread">
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                if (m.role === "user") {
                  const t = m.parts
                    .filter((p) => p.type === "text")
                    .map((p) => (p as { text: string }).text)
                    .join("");
                  return <UserBubble key={m.id} text={t} />;
                }
                return (
                  <AssistantBubble
                    key={m.id}
                    message={m}
                    isLast={isLast}
                    isStreaming={isStreaming}
                  />
                );
              })}
              {error && <div className="error">{error.message}</div>}
            </div>
          )}
        </main>

        <div className="composer">
          <div className="composer-inner">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                messages.length === 0
                  ? "Ask the AI to build a counter, a todo list, a dashboard…"
                  : "Ask a follow-up…"
              }
              rows={2}
            />
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isStreaming}
              className="btn-primary"
            >
              {isStreaming ? "…" : "Send"}
            </button>
          </div>
          <div className="composer-hint">
            Toggle devtools with <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>J</kbd>.
          </div>
        </div>
      </div>

      <JsonRenderDevtools
        spec={currentSpec}
        catalog={catalog}
        messages={messages}
        initialOpen
      />
    </JSONUIProvider>
  );
}
