import type { Spec } from "@json-render/react";

interface JsonPatch {
  op: string;
  path: string;
  value?: unknown;
  from?: string;
}

function setDeep(
  obj: Record<string, unknown>,
  segments: string[],
  value: unknown,
): void {
  let current: unknown = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = (current as Record<string, unknown>)[seg];
    if (next && typeof next === "object") {
      current = next;
    } else {
      const container = /^\d+$/.test(segments[i + 1]) ? [] : {};
      (current as Record<string, unknown>)[seg] = container;
      current = container;
    }
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current)) {
    (current as unknown[])[Number(last)] = value;
  } else {
    (current as Record<string, unknown>)[last] = value;
  }
}

function setSpecValue(spec: Spec, path: string, value: unknown): void {
  if (path === "/root") {
    (spec as Record<string, unknown>).root = value as string;
    return;
  }
  if (path === "/state") {
    (spec as Record<string, unknown>).state = value;
    return;
  }
  if (path.startsWith("/state/")) {
    if (!spec.state) (spec as Record<string, unknown>).state = {};
    const segments = path.slice("/state/".length).split("/");
    setDeep(spec.state as Record<string, unknown>, segments, value);
    return;
  }
  const elemMatch = path.match(/^\/elements\/(.+)/);
  if (elemMatch) {
    spec.elements[elemMatch[1]] = value as Spec["elements"][string];
  }
}

function applyPatch(spec: Spec, patch: JsonPatch): Spec {
  const next: Spec = {
    ...spec,
    elements: { ...spec.elements },
    ...(spec.state ? { state: { ...spec.state } } : {}),
  };
  switch (patch.op) {
    case "add":
    case "replace":
      setSpecValue(next, patch.path, patch.value);
      break;
    case "remove":
      if (patch.path.startsWith("/elements/")) {
        const key = patch.path.slice("/elements/".length);
        delete next.elements[key];
      }
      break;
  }
  return next;
}

/**
 * Fetch an AI generation endpoint that returns a JSONL patch stream,
 * applying patches progressively via onPatch.
 */
export async function streamSpec(
  url: string,
  body: Record<string, unknown>,
  onPatch: (spec: Spec) => void,
): Promise<Spec> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let msg = `API error: ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error) msg = errData.error;
    } catch {
      // use default
    }
    throw new Error(msg);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let spec: Spec = { root: "", elements: {} };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      try {
        const parsed = JSON.parse(trimmed) as JsonPatch;
        if (parsed.op) {
          spec = applyPatch(spec, parsed);
          onPatch(spec);
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim()) as JsonPatch;
      if (parsed.op) {
        spec = applyPatch(spec, parsed);
        onPatch(spec);
      }
    } catch {
      // skip
    }
  }

  return spec;
}
