import { defineCatalog } from "@json-render/core";
import {
  schema,
  standardComponentDefinitions,
  standardTransitionDefinitions,
  standardEffectDefinitions,
} from "@json-render/remotion/server";

/**
 * Custom rules for the AI to follow when generating videos
 */
const customRules = [
  // Image URLs using Picsum (free, no API key)
  'ImageSlide props: { "src": "https://picsum.photos/1920/1080?random=N", "alt": "description" } - use "src" NOT "imageUrl"',
  "Use different random numbers for each image to get different photos (e.g., ?random=1, ?random=2, ?random=3)",
  "Picsum provides random professional stock photos - great for product shots, backgrounds, and visual content",
];

/**
 * Remotion video catalog
 *
 * Uses standard definitions from @json-render/remotion,
 * with the ability to add custom components.
 *
 * @example Adding a custom component:
 * ```ts
 * components: {
 *   ...standardComponentDefinitions,
 *   MyCustomComponent: {
 *     props: z.object({ ... }),
 *     type: "scene",
 *     defaultDuration: 90,
 *     description: "My custom component",
 *   },
 * },
 * ```
 */
export const videoCatalog = defineCatalog(schema, {
  // Use all standard components from the package
  components: standardComponentDefinitions,

  // Use all standard transitions from the package
  transitions: standardTransitionDefinitions,

  // Use all standard effects from the package
  effects: standardEffectDefinitions,
});

/**
 * Get the prompt with custom rules for image generation
 */
export function getVideoPrompt(): string {
  return videoCatalog.prompt({ customRules });
}
