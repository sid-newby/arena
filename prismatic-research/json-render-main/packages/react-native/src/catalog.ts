import { z } from "zod";

// =============================================================================
// Standard Component Definitions for React Native
// =============================================================================

/**
 * Standard component definitions for React Native catalogs.
 *
 * These can be used directly or extended with custom components.
 * All components are built using React Native core primitives only.
 */
export const standardComponentDefinitions = {
  // ==========================================================================
  // Layout Components
  // ==========================================================================

  Container: {
    props: z.object({
      padding: z.number().nullable(),
      paddingHorizontal: z.number().nullable(),
      paddingVertical: z.number().nullable(),
      margin: z.number().nullable(),
      backgroundColor: z.string().nullable(),
      borderRadius: z.number().nullable(),
      flex: z.number().nullable(),
    }),
    slots: ["default"],
    description:
      "Generic container wrapper. Use for grouping elements with padding, margin, and background color.",
    example: { padding: 16, backgroundColor: "#FFFFFF" },
  },

  Row: {
    props: z.object({
      gap: z.number().nullable(),
      alignItems: z
        .enum(["flex-start", "center", "flex-end", "stretch", "baseline"])
        .nullable(),
      justifyContent: z
        .enum([
          "flex-start",
          "center",
          "flex-end",
          "space-between",
          "space-around",
          "space-evenly",
        ])
        .nullable(),
      flexWrap: z.enum(["wrap", "nowrap"]).nullable(),
      padding: z.number().nullable(),
      flex: z.number().nullable(),
    }),
    slots: ["default"],
    description:
      "Horizontal flex layout. Use for placing elements side by side.",
    example: { gap: 12, alignItems: "center" },
  },

  Column: {
    props: z.object({
      gap: z.number().nullable(),
      alignItems: z
        .enum(["flex-start", "center", "flex-end", "stretch", "baseline"])
        .nullable(),
      justifyContent: z
        .enum([
          "flex-start",
          "center",
          "flex-end",
          "space-between",
          "space-around",
          "space-evenly",
        ])
        .nullable(),
      padding: z.number().nullable(),
      flex: z.number().nullable(),
    }),
    slots: ["default"],
    description:
      "Vertical flex layout. Use for stacking elements top to bottom.",
    example: { gap: 12, padding: 16 },
  },

  ScrollContainer: {
    props: z.object({
      horizontal: z.boolean().nullable(),
      showsScrollIndicator: z.boolean().nullable(),
      padding: z.number().nullable(),
      backgroundColor: z.string().nullable(),
    }),
    slots: ["default"],
    description:
      "Scrollable container. Use for content that may overflow the screen.",
  },

  SafeArea: {
    props: z.object({
      backgroundColor: z.string().nullable(),
    }),
    slots: ["default"],
    description:
      "Safe area container that respects device notches and system bars. Use as the outermost wrapper for screens.",
  },

  Spacer: {
    props: z.object({
      size: z.number().nullable(),
      flex: z.number().nullable(),
    }),
    slots: [],
    description:
      "Empty space between elements. Set size for fixed spacing or flex for flexible spacing.",
  },

  Pressable: {
    props: z.object({}),
    events: ["press", "longPress"],
    slots: ["default"],
    description:
      "Touchable wrapper that triggers events on press. Wrap any element to make it tappable. Bind on.press to setState to update state for visibility-driven UIs like tabs.",
  },

  Divider: {
    props: z.object({
      direction: z.enum(["horizontal", "vertical"]).nullable(),
      color: z.string().nullable(),
      thickness: z.number().nullable(),
      margin: z.number().nullable(),
    }),
    slots: [],
    description: "Thin line separator between content sections.",
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
    example: { text: "Welcome", level: "h1" },
  },

  Paragraph: {
    props: z.object({
      text: z.string(),
      color: z.string().nullable(),
      align: z.enum(["left", "center", "right"]).nullable(),
      numberOfLines: z.number().nullable(),
      fontSize: z.number().nullable(),
    }),
    slots: [],
    description:
      "Body text paragraph. Use for descriptions and longer content.",
    example: { text: "This is a paragraph of body text." },
  },

  Label: {
    props: z.object({
      text: z.string(),
      color: z.string().nullable(),
      bold: z.boolean().nullable(),
      size: z.enum(["xs", "sm", "md"]).nullable(),
    }),
    slots: [],
    description:
      "Small utility text. Use for captions, form labels, and secondary information.",
    example: { text: "Status", size: "sm" },
  },

  Image: {
    props: z.object({
      src: z.string(),
      alt: z.string().nullable(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      resizeMode: z.enum(["cover", "contain", "stretch", "center"]).nullable(),
      borderRadius: z.number().nullable(),
    }),
    slots: [],
    description: "Image display. Provide a source URL and optional dimensions.",
    example: {
      src: "https://picsum.photos/300/200",
      alt: "Photo",
      width: 300,
      height: 200,
    },
  },

  Avatar: {
    props: z.object({
      src: z.string().nullable(),
      initials: z.string().nullable(),
      size: z.enum(["sm", "md", "lg", "xl"]).nullable(),
      backgroundColor: z.string().nullable(),
    }),
    slots: [],
    description:
      "Circular avatar showing an image or initials. Use for user profiles and contacts.",
    example: { initials: "JD", size: "md" },
  },

  Badge: {
    props: z.object({
      label: z.string(),
      variant: z
        .enum(["default", "info", "success", "warning", "error"])
        .nullable(),
    }),
    slots: [],
    description:
      "Small colored indicator with a label. Use for status, counts, and categories.",
    example: { label: "New", variant: "info" },
  },

  Chip: {
    props: z.object({
      label: z.string(),
      selected: z.boolean().nullable(),
      backgroundColor: z.string().nullable(),
    }),
    events: ["press", "remove"],
    slots: [],
    description:
      "Tag or filter chip. Bind on.remove for removable chips, on.press for selectable chips.",
  },

  // ==========================================================================
  // Input Components
  // ==========================================================================

  Button: {
    props: z.object({
      label: z.string(),
      variant: z
        .enum(["primary", "secondary", "danger", "outline", "ghost"])
        .nullable(),
      size: z.enum(["sm", "md", "lg"]).nullable(),
      disabled: z.boolean().nullable(),
      loading: z.boolean().nullable(),
    }),
    events: ["press"],
    slots: [],
    description:
      "Pressable button with label. Set variant for styling. Bind on.press for the handler to call on press.",
    example: { label: "Submit", variant: "primary" },
  },

  TextInput: {
    props: z.object({
      placeholder: z.string().nullable(),
      value: z.string().nullable(),
      secureTextEntry: z.boolean().nullable(),
      keyboardType: z
        .enum(["default", "email-address", "numeric", "phone-pad", "url"])
        .nullable(),
      multiline: z.boolean().nullable(),
      numberOfLines: z.number().nullable(),
      label: z.string().nullable(),
      flex: z.number().nullable(),
    }),
    events: ["submit", "focus", "blur"],
    slots: [],
    description:
      "Text input field. Use $bindState to bind to the state model for two-way binding. The value typed by the user is stored at the bound path.",
    example: {
      placeholder: "Enter text...",
      label: "Name",
    },
  },

  Switch: {
    props: z.object({
      checked: z.boolean().nullable(),
      label: z.string().nullable(),
      disabled: z.boolean().nullable(),
    }),
    events: ["change"],
    slots: [],
    description: "Toggle switch. Use $bindState to bind to the state model.",
  },

  Checkbox: {
    props: z.object({
      checked: z.boolean().nullable(),
      label: z.string().nullable(),
      disabled: z.boolean().nullable(),
    }),
    events: ["change"],
    slots: [],
    description:
      "Checkbox for boolean selections. Use $bindState to bind to the state model.",
  },

  Slider: {
    props: z.object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      step: z.number().nullable(),
      value: z.number().nullable(),
      label: z.string().nullable(),
      color: z.string().nullable(),
    }),
    slots: [],
    description:
      "Range slider for numeric values. Use $bindState to bind to the state model.",
  },

  SearchBar: {
    props: z.object({
      placeholder: z.string().nullable(),
      value: z.string().nullable(),
    }),
    events: ["submit"],
    slots: [],
    description:
      "Search input with icon. Bind on.submit to trigger search on submit.",
  },

  // ==========================================================================
  // Feedback Components
  // ==========================================================================

  Spinner: {
    props: z.object({
      size: z.enum(["small", "large"]).nullable(),
      color: z.string().nullable(),
    }),
    slots: [],
    description: "Loading spinner indicator. Use while content is loading.",
  },

  ProgressBar: {
    props: z.object({
      progress: z.number(),
      color: z.string().nullable(),
      trackColor: z.string().nullable(),
      height: z.number().nullable(),
    }),
    slots: [],
    description: "Horizontal progress bar. Set progress from 0 to 1.",
  },

  // ==========================================================================
  // Composite Components
  // ==========================================================================

  Card: {
    props: z.object({
      title: z.string().nullable(),
      subtitle: z.string().nullable(),
      padding: z.number().nullable(),
      backgroundColor: z.string().nullable(),
      borderRadius: z.number().nullable(),
      elevated: z.boolean().nullable(),
    }),
    slots: ["default"],
    description:
      "Elevated card container with optional title. Use for grouping related content.",
    example: { title: "Details", padding: 16, elevated: true },
  },

  ListItem: {
    props: z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      leading: z.string().nullable(),
      trailing: z.string().nullable(),
      showChevron: z.boolean().nullable(),
    }),
    events: ["press"],
    slots: [],
    description:
      "List row with title, subtitle, and optional leading/trailing text. Bind on.press for the press handler.",
    example: {
      title: "Settings",
      subtitle: "Manage your preferences",
      showChevron: true,
    },
  },

  Modal: {
    props: z.object({
      visible: z.boolean(),
      title: z.string().nullable(),
      animationType: z.enum(["slide", "fade", "none"]).nullable(),
    }),
    slots: ["default"],
    description:
      "Modal overlay dialog. Use $bindState on visible to bind visibility to the state model.",
  },
};

// =============================================================================
// Standard Action Definitions for React Native
// =============================================================================

/**
 * Standard action definitions for React Native catalogs.
 *
 * These use React Native core APIs (Alert, Share, Linking) and
 * user-provided functions (navigate).
 */
export const standardActionDefinitions = {
  navigate: {
    params: z.object({
      screen: z.string(),
      params: z.record(z.string(), z.unknown()).nullable(),
    }),
    description:
      "Navigate to a screen. Calls the user-provided navigation function.",
  },

  goBack: {
    params: z.object({}),
    description: "Navigate back to the previous screen.",
  },

  showAlert: {
    params: z.object({
      title: z.string(),
      message: z.string().nullable(),
      buttons: z
        .array(
          z.object({
            text: z.string(),
            style: z.enum(["default", "cancel", "destructive"]).nullable(),
            action: z.string().nullable(),
          }),
        )
        .nullable(),
    }),
    description: "Show a native alert dialog using Alert.alert().",
  },

  share: {
    params: z.object({
      message: z.string(),
      url: z.string().nullable(),
      title: z.string().nullable(),
    }),
    description: "Open the native share sheet using Share.share().",
  },

  openURL: {
    params: z.object({
      url: z.string(),
    }),
    description: "Open a URL in the default browser using Linking.openURL().",
  },

  setState: {
    params: z.object({
      statePath: z.string(),
      value: z.unknown(),
    }),
    description: "Update a value in the state model at the given statePath.",
  },

  pushState: {
    params: z.object({
      statePath: z.string(),
      value: z.unknown(),
      clearStatePath: z.string().optional(),
    }),
    description:
      'Append an item to an array in the state model. The value can contain { $state: "/statePath" } references to read from current state, and "$id" to auto-generate a unique ID. Use clearStatePath to reset another path after pushing (e.g. clear an input field). Example: { statePath: "/todos", value: { id: "$id", title: { $state: "/newTodoText" }, completed: false }, clearStatePath: "/newTodoText" }.',
  },

  removeState: {
    params: z.object({
      statePath: z.string(),
      index: z.number(),
    }),
    description:
      "Remove an item from an array in the state model at the given index.",
  },

  refresh: {
    params: z.object({
      target: z.string().nullable(),
    }),
    description:
      "Trigger a data refresh. Optionally specify a target to refresh.",
  },
};

// =============================================================================
// Types
// =============================================================================

/**
 * Type for a component definition
 */
export type ComponentDefinition = {
  props: z.ZodType;
  slots: string[];
  events?: string[];
  description: string;
};

/**
 * Type for an action definition
 */
export type ActionDefinition = {
  params: z.ZodType;
  description: string;
};
