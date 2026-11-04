import type { JsonPatch, Spec } from "@json-render/core";

/**
 * Token usage metadata from an AI generation.
 * Matches the shape used by renderers (e.g. `@json-render/react`).
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * A single devtools event. Events flow into the `EventStore` from framework
 * adapters (state changes, action dispatches) and from stream taps.
 */
export type DevtoolsEvent =
  | {
      kind: "spec-changed";
      at: number;
      spec: Spec;
    }
  | {
      kind: "state-set";
      at: number;
      path: string;
      prev: unknown;
      next: unknown;
    }
  | {
      kind: "action-dispatched";
      at: number;
      id: string;
      name: string;
      params?: unknown;
    }
  | {
      kind: "action-settled";
      at: number;
      id: string;
      ok: boolean;
      result?: unknown;
      error?: string;
      durationMs: number;
    }
  | {
      kind: "stream-patch";
      at: number;
      patch: JsonPatch;
      source: "json" | "yaml";
    }
  | {
      kind: "stream-text";
      at: number;
      text: string;
    }
  | {
      kind: "stream-usage";
      at: number;
      usage: TokenUsage;
    }
  | {
      kind: "stream-lifecycle";
      at: number;
      phase: "start" | "end";
      ok?: boolean;
    };

export type DevtoolsEventKind = DevtoolsEvent["kind"];

/**
 * Options for creating a picker session. A picker session lets the user
 * click an element in the host DOM to surface the matching element key
 * in the Spec panel, and vice versa.
 */
export interface PickerOptions {
  /** Called when the user clicks an element with a `data-jr-key` attribute. */
  onPick: (key: string) => void;
  /** Called when the user exits picker mode without selecting. */
  onCancel?: () => void;
}

/**
 * Handle returned from {@link startPicker}. Call `.stop()` to tear down.
 */
export interface PickerSession {
  stop: () => void;
}
