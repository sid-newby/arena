import { describe, expect, it } from "vitest";
import type { SpecDataPart } from "@json-render/core";
import { SPEC_DATA_PART_TYPE } from "@json-render/core";
import { createEventStore } from "./event-store";
import { recordEvent, scanMessageParts } from "./stream-tap";

describe("scanMessageParts", () => {
  it("emits stream-patch events for spec data parts", () => {
    const store = createEventStore();
    const seen = new WeakSet<object>();

    const data: SpecDataPart = {
      type: "patch",
      patch: {
        op: "add",
        path: "/elements/x",
        value: { type: "Card", props: {} },
      },
    };
    const parts = [{ type: SPEC_DATA_PART_TYPE, data }];

    scanMessageParts(parts, store, seen);

    const snap = store.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]?.kind).toBe("stream-patch");
    if (snap[0]?.kind === "stream-patch") {
      expect(snap[0].patch.op).toBe("add");
    }
  });

  it("is idempotent: a part is only recorded once", () => {
    const store = createEventStore();
    const seen = new WeakSet<object>();

    const part = {
      type: SPEC_DATA_PART_TYPE,
      data: {
        type: "patch",
        patch: { op: "add", path: "/state/x", value: 1 },
      } as SpecDataPart,
    };

    scanMessageParts([part], store, seen);
    scanMessageParts([part], store, seen);

    expect(store.size()).toBe(1);
  });

  it("ignores non-spec parts", () => {
    const store = createEventStore();
    const seen = new WeakSet<object>();

    scanMessageParts(
      [
        { type: "text", text: "hello" },
        { type: "tool-foo", data: {} },
      ],
      store,
      seen,
    );

    expect(store.size()).toBe(0);
  });
});

describe("recordEvent", () => {
  it("forwards events into the store", () => {
    const store = createEventStore();
    recordEvent(store, {
      kind: "action-dispatched",
      at: 1,
      id: "a",
      name: "foo",
    });
    expect(store.size()).toBe(1);
  });
});
