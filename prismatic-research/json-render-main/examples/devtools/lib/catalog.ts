import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * A compact, opinionated catalog focused on interactive UI patterns that
 * show up well in the devtools panel: state changes, action dispatches,
 * input bindings, conditional visibility, and repeated lists.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z.string().nullable(),
        subtitle: z.string().nullable(),
        tone: z
          .enum(["default", "accent", "success", "warn", "muted"])
          .nullable(),
      }),
      slots: ["default"],
      description: "Container with optional title/subtitle.",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["1", "2", "3"]).nullable(),
      }),
      description: "Section heading. level defaults to 2.",
    },
    Text: {
      props: z.object({
        text: z.string(),
        muted: z.boolean().nullable(),
        weight: z.enum(["regular", "medium", "bold"]).nullable(),
      }),
      description: "Paragraph text.",
    },
    Stack: {
      props: z.object({
        gap: z.enum(["xs", "sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description: "Vertical stack with gap.",
    },
    Row: {
      props: z.object({
        gap: z.enum(["xs", "sm", "md", "lg"]).nullable(),
        align: z.enum(["start", "center", "end", "between"]).nullable(),
      }),
      slots: ["default"],
      description: "Horizontal row with gap.",
    },
    Grid: {
      props: z.object({
        columns: z.enum(["2", "3", "4"]).nullable(),
        gap: z.enum(["xs", "sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description: "Multi-column grid layout.",
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().nullable(),
        trend: z.enum(["up", "down", "flat"]).nullable(),
      }),
      description: "Single labelled metric with optional delta + trend.",
    },
    Badge: {
      props: z.object({
        label: z.string(),
        tone: z
          .enum(["default", "accent", "success", "warn", "muted"])
          .nullable(),
      }),
      description: "Small pill-shaped label.",
    },
    Divider: {
      props: z.object({}),
      description: "Horizontal rule.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary", "ghost"]).nullable(),
        size: z.enum(["sm", "md"]).nullable(),
        disabled: z.boolean().nullable(),
      }),
      description:
        "Clickable button. Use on.press to trigger actions (setState, pushState, removeState).",
    },
    TextInput: {
      props: z.object({
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
      }),
      description:
        "Text input. Use { $bindState: '/path' } on value for two-way binding.",
    },
    Checkbox: {
      props: z.object({
        label: z.string().nullable(),
        checked: z.boolean().nullable(),
      }),
      description:
        "Checkbox. Use { $bindState: '/path' } on checked for two-way binding.",
    },
    ProgressBar: {
      props: z.object({
        value: z.number(),
        max: z.number().nullable(),
        tone: z.enum(["default", "accent", "success", "warn"]).nullable(),
      }),
      description:
        "Horizontal progress bar. value is [0, max]. max defaults to 100.",
    },
    Callout: {
      props: z.object({
        title: z.string().nullable(),
        text: z.string(),
        tone: z.enum(["info", "success", "warn", "tip"]).nullable(),
      }),
      description: "Highlighted note / tip / warning box.",
    },
    List: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Vertical list container. Pair with repeat to iterate an array.",
    },
    ListItem: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
        meta: z.string().nullable(),
      }),
      description: "Single list row.",
    },
    Avatar: {
      props: z.object({
        initials: z.string(),
        tone: z.enum(["default", "accent", "success", "warn"]).nullable(),
      }),
      description: "Circular avatar with 1-2 initials.",
    },
  },
  actions: {},
});

export type DemoCatalog = typeof catalog;
