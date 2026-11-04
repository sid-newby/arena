import { z } from "zod";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react-native/schema";
import {
  standardComponentDefinitions,
  standardActionDefinitions,
} from "@json-render/react-native/catalog";

/**
 * App-specific custom rules for the AI.
 *
 * Generic React Native rules (layout, tabs, navigation, element integrity)
 * are baked into the @json-render/react-native schema as defaultRules.
 * Core concepts (initial state, $state, Repeat, pushState/removeState)
 * are covered by the core system prompt.
 *
 * Only app-specific preferences belong here.
 */
export const customRules = [
  // Placeholder images using Picsum (free, no API key)
  'Image props: { "src": "https://picsum.photos/WIDTH/HEIGHT?random=N" } - use Picsum for any placeholder or example images',
  "Use different random numbers for each image to get different photos (e.g., ?random=1, ?random=2, ?random=3)",
  "Picsum provides random professional stock photos - great for avatars, hero images, product shots, and backgrounds",
  'Avatar props: { "src": "https://picsum.photos/100/100?random=N" } - use Picsum for avatar images too',

  // Icons vs emojis (app uses Ionicons via the custom Icon component)
  "CRITICAL: NEVER use emoji characters for UI icons, action buttons, navigation items, or indicators. ALWAYS use the Icon component instead.",
  "The Icon component uses Ionicons. Common icon names: heart, heart-outline, chatbubble-outline, share-social-outline, bookmark-outline, bookmark, home, home-outline, search, person, person-outline, add, close, checkmark, ellipsis-horizontal, ellipsis-vertical, camera-outline, notifications-outline, settings-outline, send, arrow-back, arrow-forward, chevron-back, chevron-forward, star, star-outline, eye-outline, eye-off-outline, trash-outline, create-outline, refresh, lock-closed-outline, mail-outline, call-outline, location-outline, time-outline, play, pause, image-outline, menu, filter-outline, globe-outline, link-outline, cloud-outline, download-outline, share-outline.",
  "Emojis ARE allowed inside user-generated content such as comment text, post captions, chat messages, and status text - just like real social apps. Only UI chrome (buttons, tabs, indicators) must use the Icon component.",
];

/**
 * React Native catalog
 *
 * Uses all standard components and actions from @json-render/react-native,
 * plus an Icon component powered by Ionicons (@expo/vector-icons).
 */
export const catalog = defineCatalog(schema, {
  components: {
    ...standardComponentDefinitions,
    Icon: {
      props: z.object({
        name: z.string(),
        size: z.number().nullable(),
        color: z.string().nullable(),
      }),
      slots: [],
      description:
        "Icon display using Ionicons. Use for action buttons, navigation items, and indicators. ALWAYS use this instead of emoji characters for UI icons. Use Ionicons naming convention (e.g. heart, heart-outline, chatbubble-outline, share-social-outline).",
      example: { name: "heart-outline", size: 24, color: "#007AFF" },
    },
  },
  actions: standardActionDefinitions,
});
