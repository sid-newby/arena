import { describe, it, expect } from "vitest";
import {
  traverseSpec,
  collectUsedComponents,
  collectStatePaths,
  collectActions,
} from "./traverse";
import type { Spec } from "@json-render/core";

describe("traverseSpec", () => {
  it("visits all elements depth-first", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["child1", "child2"],
        },
        child1: {
          type: "Text",
          props: {},
        },
        child2: {
          type: "Button",
          props: {},
        },
      },
    };

    const visited: string[] = [];
    traverseSpec(spec, (_element, key) => {
      visited.push(key);
    });

    expect(visited).toEqual(["root", "child1", "child2"]);
  });

  it("handles empty spec", () => {
    const visited: string[] = [];
    traverseSpec(null as unknown as Spec, (_element, key) => {
      visited.push(key);
    });
    expect(visited).toEqual([]);
  });

  it("visits named slot children depth-first", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Layout",
          props: {},
          children: ["main"],
          slots: {
            header: ["heading"],
            footer: ["actions"],
          },
        },
        main: { type: "Content", props: {} },
        heading: { type: "Heading", props: {} },
        actions: { type: "Actions", props: {} },
      },
    };

    const visited: string[] = [];
    traverseSpec(spec, (_element, key) => {
      visited.push(key);
    });

    expect(visited).toEqual(["root", "main", "heading", "actions"]);
  });
});

describe("collectUsedComponents", () => {
  it("collects unique component types", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: {},
          children: ["child1", "child2"],
        },
        child1: {
          type: "Text",
          props: {},
        },
        child2: {
          type: "Text",
          props: {},
        },
      },
    };

    const components = collectUsedComponents(spec);
    expect(components).toEqual(new Set(["Card", "Text"]));
  });
});

describe("collectStatePaths", () => {
  it("collects paths from statePath props", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Metric",
          props: { statePath: "analytics/revenue" },
        },
      },
    };

    const paths = collectStatePaths(spec);
    expect(paths).toEqual(new Set(["analytics/revenue"]));
  });

  it("collects paths from dynamic value objects", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Text",
          props: { content: { $state: "/user/name" } },
        },
      },
    };

    const paths = collectStatePaths(spec);
    expect(paths).toEqual(new Set(["/user/name"]));
  });
});

describe("collectActions", () => {
  it("collects action names from props", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Button",
          props: { action: "submit_form" },
        },
      },
    };

    const actions = collectActions(spec);
    expect(actions).toEqual(new Set(["submit_form"]));
  });

  it("collects actions from on event bindings", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Button",
          props: {},
          on: { press: { action: "submitForm" } },
        },
      },
    };

    const actions = collectActions(spec);
    expect(actions).toEqual(new Set(["submitForm"]));
  });

  it("collects actions from on array bindings", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Button",
          props: {},
          on: {
            press: [{ action: "save" }, { action: "navigate" }],
          },
        },
      },
    };

    const actions = collectActions(spec);
    expect(actions).toEqual(new Set(["save", "navigate"]));
  });

  it("collects actions from both props and on", () => {
    const spec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "Button",
          props: { action: "submit_form" },
          on: { press: { action: "setState", params: { statePath: "/x" } } },
        },
      },
    };

    const actions = collectActions(spec);
    expect(actions).toEqual(new Set(["submit_form", "setState"]));
  });
});
