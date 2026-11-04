import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * json-render + HarnessAgent Example Catalog
 *
 * Components for a coding agent (Claude Code running in a Vercel Sandbox)
 * to report its work as structured UI: plans, commands, file changes,
 * test results, and summaries.
 */
export const agentReportCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["horizontal", "vertical"]).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description: "Flex container for laying out children",
      example: { direction: "vertical", gap: "md" },
    },

    Grid: {
      props: z.object({
        columns: z.enum(["2", "3"]).nullable(),
      }),
      slots: ["default"],
      description: "Multi-column grid layout",
      example: { columns: "2" },
    },

    Card: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description: "Container card grouping related content, never nested",
      example: { title: "Test results" },
    },

    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["1", "2", "3"]).nullable(),
      }),
      description: "Section heading",
      example: { text: "What I changed", level: "2" },
    },

    Text: {
      props: z.object({
        content: z.string(),
        muted: z.boolean().nullable(),
      }),
      description: "Paragraph of text",
      example: { content: "All tests pass after the fix." },
    },

    Badge: {
      props: z.object({
        label: z.string(),
        tone: z.enum(["neutral", "success", "warning", "error"]).nullable(),
      }),
      description: "Small status label",
      example: { label: "passing", tone: "success" },
    },

    Callout: {
      props: z.object({
        title: z.string().nullable(),
        content: z.string(),
        tone: z.enum(["info", "success", "warning", "error"]).nullable(),
      }),
      description: "Highlighted note for key takeaways, risks, or follow-ups",
      example: {
        title: "Follow-up",
        content: "Consider adding a regression test for the edge case.",
        tone: "info",
      },
    },

    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
      }),
      description: "Key number with a label (files changed, duration, etc.)",
      example: { label: "Files changed", value: "4", detail: "+120 / -36" },
    },

    Steps: {
      props: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            detail: z.string().nullable(),
            status: z.enum(["done", "active", "pending", "error"]),
          }),
        ),
      }),
      description: "Ordered list of work steps with per-step status",
      example: {
        items: [
          { title: "Reproduce the failure", detail: null, status: "done" },
          { title: "Fix the off-by-one", detail: null, status: "active" },
        ],
      },
    },

    FileChange: {
      props: z.object({
        path: z.string(),
        kind: z.enum(["created", "modified", "deleted"]),
        summary: z.string().nullable(),
        additions: z.number().nullable(),
        deletions: z.number().nullable(),
      }),
      description: "One changed file with what was done to it",
      example: {
        path: "src/parser.ts",
        kind: "modified",
        summary: "Handle empty input in tokenize()",
        additions: 12,
        deletions: 3,
      },
    },

    CodeBlock: {
      props: z.object({
        code: z.string(),
        language: z.string().nullable(),
        title: z.string().nullable(),
      }),
      description: "Syntax-highlighted code snippet",
      example: {
        code: "export const sum = (a: number, b: number) => a + b;",
        language: "typescript",
        title: "src/sum.ts",
      },
    },

    Terminal: {
      props: z.object({
        command: z.string(),
        output: z.string().nullable(),
        exitCode: z.number().nullable(),
      }),
      description: "A command that was run and its output",
      example: {
        command: "pnpm test",
        output: "12 passed, 0 failed",
        exitCode: 0,
      },
    },

    TestResults: {
      props: z.object({
        passed: z.number(),
        failed: z.number(),
        skipped: z.number().nullable(),
        failures: z
          .array(
            z.object({
              name: z.string(),
              message: z.string(),
            }),
          )
          .nullable(),
      }),
      description: "Test run summary with optional failure details",
      example: { passed: 11, failed: 1, skipped: 0, failures: null },
    },

    BarChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(
          z.object({
            label: z.string(),
            value: z.number(),
          }),
        ),
        unit: z.string().nullable(),
      }),
      description:
        "Bar chart comparing labeled numeric values (e.g. bundle size per module, benchmark per case). Pass already-computed numbers; do not aggregate raw data.",
      example: {
        title: "Build time by package",
        data: [
          { label: "core", value: 1.2 },
          { label: "react", value: 2.8 },
          { label: "cli", value: 0.6 },
        ],
        unit: "s",
      },
    },

    LineChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(
          z.object({
            label: z.string(),
            value: z.number(),
          }),
        ),
        unit: z.string().nullable(),
      }),
      description:
        "Line chart showing a numeric value as it changes across an ordered sequence (e.g. coverage per commit, latency over runs). Points are connected in array order.",
      example: {
        title: "Coverage over commits",
        data: [
          { label: "a1b2", value: 71 },
          { label: "c3d4", value: 78 },
          { label: "e5f6", value: 84 },
        ],
        unit: "%",
      },
    },
  },
  actions: {},
});
