import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { defineRegistry, type Components } from "@json-render/react-native";
import { catalog } from "./catalog";

// =============================================================================
// Registry
// =============================================================================

/**
 * Custom component registry using defineRegistry.
 *
 * Only custom components need to be defined here — standard React Native
 * components (Container, Row, Column, Button, etc.) are included automatically
 * by the Renderer via `includeStandard`.
 */
export const { registry } = defineRegistry(catalog, {
  components: {
    Icon: ({ props }) => (
      <Ionicons
        name={props.name as keyof typeof Ionicons.glyphMap}
        size={props.size ?? 24}
        color={props.color ?? "#111827"}
      />
    ),
  } as Components<typeof catalog>,
});
