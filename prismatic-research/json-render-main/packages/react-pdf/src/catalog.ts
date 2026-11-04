import { z } from "zod";

/**
 * Standard component definitions for React PDF catalogs.
 *
 * These define the available PDF components with their Zod prop schemas.
 * All components render using @react-pdf/renderer primitives.
 */
export const standardComponentDefinitions = {
  // ==========================================================================
  // Document Structure
  // ==========================================================================

  Document: {
    props: z.object({
      title: z.string().nullable(),
      author: z.string().nullable(),
      subject: z.string().nullable(),
    }),
    slots: ["default"],
    description:
      "Top-level PDF document wrapper. Must be the root element. Children must be Page components.",
    example: { title: "Invoice #1234", author: "Acme Corp" },
  },

  Page: {
    props: z.object({
      size: z.enum(["A4", "A3", "A5", "LETTER", "LEGAL", "TABLOID"]).nullable(),
      orientation: z.enum(["portrait", "landscape"]).nullable(),
      marginTop: z.number().nullable(),
      marginBottom: z.number().nullable(),
      marginLeft: z.number().nullable(),
      marginRight: z.number().nullable(),
      backgroundColor: z.string().nullable(),
    }),
    slots: ["default"],
    description:
      "A page in the PDF document. Set size and orientation. Children are laid out vertically by default.",
    example: { size: "A4", orientation: "portrait" },
  },

  // ==========================================================================
  // Layout Components
  // ==========================================================================

  View: {
    props: z.object({
      padding: z.number().nullable(),
      paddingTop: z.number().nullable(),
      paddingBottom: z.number().nullable(),
      paddingLeft: z.number().nullable(),
      paddingRight: z.number().nullable(),
      margin: z.number().nullable(),
      backgroundColor: z.string().nullable(),
      borderWidth: z.number().nullable(),
      borderColor: z.string().nullable(),
      borderRadius: z.number().nullable(),
      flex: z.number().nullable(),
      alignItems: z
        .enum(["flex-start", "center", "flex-end", "stretch"])
        .nullable(),
      justifyContent: z
        .enum([
          "flex-start",
          "center",
          "flex-end",
          "space-between",
          "space-around",
        ])
        .nullable(),
    }),
    slots: ["default"],
    description:
      "Generic container for grouping elements. Supports padding, margin, background, border, and flex alignment.",
    example: { padding: 10, backgroundColor: "#f9f9f9", alignItems: "center" },
  },

  Row: {
    props: z.object({
      gap: z.number().nullable(),
      alignItems: z
        .enum(["flex-start", "center", "flex-end", "stretch"])
        .nullable(),
      justifyContent: z
        .enum([
          "flex-start",
          "center",
          "flex-end",
          "space-between",
          "space-around",
        ])
        .nullable(),
      padding: z.number().nullable(),
      flex: z.number().nullable(),
      wrap: z.boolean().nullable(),
    }),
    slots: ["default"],
    description:
      "Horizontal flex layout. Use for placing elements side by side.",
    example: { gap: 10, alignItems: "center" },
  },

  Column: {
    props: z.object({
      gap: z.number().nullable(),
      alignItems: z
        .enum(["flex-start", "center", "flex-end", "stretch"])
        .nullable(),
      justifyContent: z
        .enum([
          "flex-start",
          "center",
          "flex-end",
          "space-between",
          "space-around",
        ])
        .nullable(),
      padding: z.number().nullable(),
      flex: z.number().nullable(),
    }),
    slots: ["default"],
    description:
      "Vertical flex layout. Use for stacking elements top to bottom.",
    example: { gap: 8, padding: 10 },
  },

  // ==========================================================================
  // Content Components
  // ==========================================================================

  Heading: {
    props: z.object({
      text: z.string(),
      level: z.enum(["h1", "h2", "h3", "h4"]).nullable(),
      color: z.string().nullable(),
      align: z.enum(["left", "center", "right"]).nullable(),
    }),
    slots: [],
    description:
      "Heading text at various levels. h1 is largest, h4 is smallest.",
    example: { text: "Invoice", level: "h1" },
  },

  Text: {
    props: z.object({
      text: z.string(),
      fontSize: z.number().nullable(),
      color: z.string().nullable(),
      align: z.enum(["left", "center", "right"]).nullable(),
      fontWeight: z.enum(["normal", "bold"]).nullable(),
      fontStyle: z.enum(["normal", "italic"]).nullable(),
      lineHeight: z.number().nullable(),
    }),
    slots: [],
    description:
      "Body text with configurable size, color, weight, and alignment.",
    example: { text: "Thank you for your business." },
  },

  Image: {
    props: z.object({
      src: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      objectFit: z.enum(["contain", "cover", "fill", "none"]).nullable(),
    }),
    slots: [],
    description:
      "Image from a URL. Specify width and/or height to control size. For placeholder/stock images use https://picsum.photos/{width}/{height}?random={n} where {n} is a unique number per image.",
    example: {
      src: "https://picsum.photos/400/300?random=1",
      width: 400,
      height: 300,
    },
  },

  Link: {
    props: z.object({
      text: z.string(),
      href: z.string(),
      fontSize: z.number().nullable(),
      color: z.string().nullable(),
    }),
    slots: [],
    description: "Hyperlink with visible text and a URL.",
    example: { text: "Visit our website", href: "https://example.com" },
  },

  // ==========================================================================
  // Data Components
  // ==========================================================================

  Table: {
    props: z.object({
      columns: z.array(
        z.object({
          header: z.string(),
          width: z.string().nullable(),
          align: z.enum(["left", "center", "right"]).nullable(),
        }),
      ),
      rows: z.array(z.array(z.string())),
      headerBackgroundColor: z.string().nullable(),
      headerTextColor: z.string().nullable(),
      borderColor: z.string().nullable(),
      fontSize: z.number().nullable(),
      striped: z.boolean().nullable(),
    }),
    slots: [],
    description:
      "Data table with typed columns and rows. Each row is a string array matching the column count.",
    example: {
      columns: [
        { header: "Item", width: "60%" },
        { header: "Price", width: "40%", align: "right" },
      ],
      rows: [
        ["Widget A", "$10.00"],
        ["Widget B", "$25.00"],
      ],
    },
  },

  List: {
    props: z.object({
      items: z.array(z.string()),
      ordered: z.boolean().nullable(),
      fontSize: z.number().nullable(),
      color: z.string().nullable(),
      spacing: z.number().nullable(),
    }),
    slots: [],
    description:
      "Ordered or unordered list. Each item is rendered as a text line with a bullet or number.",
    example: {
      items: ["First item", "Second item", "Third item"],
      ordered: false,
    },
  },

  // ==========================================================================
  // Decorative Components
  // ==========================================================================

  Divider: {
    props: z.object({
      color: z.string().nullable(),
      thickness: z.number().nullable(),
      marginTop: z.number().nullable(),
      marginBottom: z.number().nullable(),
    }),
    slots: [],
    description: "Horizontal line separator between content sections.",
    example: { color: "#e5e7eb", thickness: 1 },
  },

  Spacer: {
    props: z.object({
      height: z.number().nullable(),
    }),
    slots: [],
    description: "Empty vertical space between elements.",
    example: { height: 20 },
  },

  // ==========================================================================
  // Page-Level Components
  // ==========================================================================

  PageNumber: {
    props: z.object({
      format: z.string().nullable(),
      fontSize: z.number().nullable(),
      color: z.string().nullable(),
      align: z.enum(["left", "center", "right"]).nullable(),
    }),
    slots: [],
    description:
      'Renders the current page number and total pages. Format uses {pageNumber} and {totalPages} placeholders, e.g. "Page {pageNumber} of {totalPages}". Default: "{pageNumber} / {totalPages}".',
    example: {
      format: "Page {pageNumber} of {totalPages}",
      align: "center",
      fontSize: 10,
    },
  },
};

export type StandardComponentDefinitions = typeof standardComponentDefinitions;

export type StandardComponentProps<
  K extends keyof StandardComponentDefinitions,
> = StandardComponentDefinitions[K]["props"] extends { _output: infer O }
  ? O
  : z.output<StandardComponentDefinitions[K]["props"]>;
