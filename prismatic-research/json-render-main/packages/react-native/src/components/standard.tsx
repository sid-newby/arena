import React from "react";
import {
  View,
  Text,
  Image as RNImage,
  ScrollView,
  SafeAreaView,
  Pressable,
  TextInput as RNTextInput,
  Switch as RNSwitch,
  ActivityIndicator,
  Modal as RNModal,
  StyleSheet,
  Alert,
  Share,
  Linking,
} from "react-native";
import type { ComponentRenderProps } from "../renderer";
import type { ComponentRegistry } from "../renderer";
import { useBoundProp } from "../hooks";

// =============================================================================
// Layout Components
// =============================================================================

function ContainerComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    padding?: number;
    paddingHorizontal?: number;
    paddingVertical?: number;
    margin?: number;
    backgroundColor?: string;
    borderRadius?: number;
    flex?: number;
  };

  return (
    <View
      style={{
        padding: p.padding ?? undefined,
        paddingHorizontal: p.paddingHorizontal ?? undefined,
        paddingVertical: p.paddingVertical ?? undefined,
        margin: p.margin ?? undefined,
        backgroundColor: p.backgroundColor ?? undefined,
        borderRadius: p.borderRadius ?? undefined,
        flex: p.flex ?? undefined,
      }}
    >
      {children}
    </View>
  );
}

function RowComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    gap?: number;
    alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
    justifyContent?:
      | "flex-start"
      | "center"
      | "flex-end"
      | "space-between"
      | "space-around"
      | "space-evenly";
    flexWrap?: "wrap" | "nowrap";
    padding?: number;
    flex?: number;
  };

  return (
    <View
      style={{
        flexDirection: "row",
        gap: p.gap ?? undefined,
        alignItems: p.alignItems ?? undefined,
        justifyContent: p.justifyContent ?? undefined,
        flexWrap: p.flexWrap ?? undefined,
        padding: p.padding ?? undefined,
        flex: p.flex ?? undefined,
      }}
    >
      {children}
    </View>
  );
}

function ColumnComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    gap?: number;
    alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
    justifyContent?:
      | "flex-start"
      | "center"
      | "flex-end"
      | "space-between"
      | "space-around"
      | "space-evenly";
    padding?: number;
    flex?: number;
  };

  return (
    <View
      style={{
        flexDirection: "column",
        gap: p.gap ?? undefined,
        alignItems: p.alignItems ?? undefined,
        justifyContent: p.justifyContent ?? undefined,
        padding: p.padding ?? undefined,
        flex: p.flex ?? undefined,
      }}
    >
      {children}
    </View>
  );
}

function ScrollContainerComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    horizontal?: boolean;
    showsScrollIndicator?: boolean;
    padding?: number;
    backgroundColor?: string;
    flex?: number;
  };

  return (
    <ScrollView
      horizontal={p.horizontal ?? false}
      showsVerticalScrollIndicator={p.showsScrollIndicator ?? true}
      showsHorizontalScrollIndicator={p.showsScrollIndicator ?? true}
      contentContainerStyle={{
        padding: p.padding ?? undefined,
      }}
      style={{
        flex: p.flex ?? 1,
        backgroundColor: p.backgroundColor ?? undefined,
      }}
    >
      {children}
    </ScrollView>
  );
}

function SafeAreaComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    backgroundColor?: string;
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: p.backgroundColor ?? undefined,
      }}
    >
      {children}
    </SafeAreaView>
  );
}

function SpacerComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    size?: number;
    flex?: number;
  };

  return (
    <View
      style={{
        width: p.size ?? undefined,
        height: p.size ?? undefined,
        flex: p.flex ?? undefined,
      }}
    />
  );
}

function PressableComponent({ children, emit }: ComponentRenderProps) {
  return (
    <Pressable
      onPress={() => emit("press")}
      onLongPress={() => emit("longPress")}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function DividerComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    direction?: "horizontal" | "vertical";
    color?: string;
    thickness?: number;
    margin?: number;
  };

  const isVertical = p.direction === "vertical";
  const thickness = p.thickness ?? 1;
  const color = p.color ?? "#e5e7eb";

  return (
    <View
      style={{
        width: isVertical ? thickness : "100%",
        height: isVertical ? "100%" : thickness,
        backgroundColor: color,
        marginVertical: isVertical ? 0 : (p.margin ?? 8),
        marginHorizontal: isVertical ? (p.margin ?? 8) : 0,
      }}
    />
  );
}

// =============================================================================
// Content Components
// =============================================================================

const headingSizes = {
  h1: 32,
  h2: 24,
  h3: 20,
  h4: 16,
};

function HeadingComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    text: string;
    level?: "h1" | "h2" | "h3" | "h4";
    color?: string;
    align?: "left" | "center" | "right";
  };

  const level = p.level ?? "h2";

  return (
    <Text
      style={{
        fontSize: headingSizes[level],
        fontWeight: "700",
        color: p.color ?? "#111827",
        textAlign: p.align ?? "left",
      }}
    >
      {p.text}
    </Text>
  );
}

function ParagraphComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    text: string;
    color?: string;
    align?: "left" | "center" | "right";
    numberOfLines?: number;
    fontSize?: number;
  };

  return (
    <Text
      numberOfLines={p.numberOfLines ?? undefined}
      style={{
        fontSize: p.fontSize ?? 16,
        lineHeight: (p.fontSize ?? 16) * 1.5,
        color: p.color ?? "#374151",
        textAlign: p.align ?? "left",
      }}
    >
      {p.text}
    </Text>
  );
}

const labelSizes = {
  xs: 10,
  sm: 12,
  md: 14,
};

function LabelComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    text: string;
    color?: string;
    bold?: boolean;
    size?: "xs" | "sm" | "md";
  };

  return (
    <Text
      style={{
        fontSize: labelSizes[p.size ?? "sm"],
        fontWeight: p.bold ? "600" : "400",
        color: p.color ?? "#6b7280",
      }}
    >
      {p.text}
    </Text>
  );
}

function ImageComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    resizeMode?: "cover" | "contain" | "stretch" | "center";
    borderRadius?: number;
  };

  return (
    <RNImage
      source={{ uri: p.src }}
      accessibilityLabel={p.alt ?? undefined}
      resizeMode={p.resizeMode ?? "cover"}
      style={{
        width: p.width ?? "100%",
        height: p.height ?? 200,
        borderRadius: p.borderRadius ?? 0,
      }}
    />
  );
}

const avatarSizeMap = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
};

function AvatarComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    src?: string;
    initials?: string;
    size?: "sm" | "md" | "lg" | "xl";
    backgroundColor?: string;
  };

  const size = avatarSizeMap[p.size ?? "md"];
  const bgColor = p.backgroundColor ?? "#6366f1";

  if (p.src) {
    return (
      <RNImage
        source={{ uri: p.src }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#e5e7eb",
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#ffffff",
          fontSize: size * 0.4,
          fontWeight: "600",
        }}
      >
        {p.initials ?? "?"}
      </Text>
    </View>
  );
}

const badgeVariantColors: Record<string, { bg: string; text: string }> = {
  default: { bg: "#e5e7eb", text: "#374151" },
  info: { bg: "#dbeafe", text: "#1d4ed8" },
  success: { bg: "#dcfce7", text: "#15803d" },
  warning: { bg: "#fef3c7", text: "#92400e" },
  error: { bg: "#fee2e2", text: "#dc2626" },
};

function BadgeComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    label: string;
    variant?: "default" | "info" | "success" | "warning" | "error";
  };

  const colors = badgeVariantColors[p.variant ?? "default"] ?? {
    bg: "#e5e7eb",
    text: "#374151",
  };

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: colors.text,
        }}
      >
        {p.label}
      </Text>
    </View>
  );
}

function ChipComponent({ element, emit }: ComponentRenderProps) {
  const p = element.props as {
    label: string;
    selected?: boolean;
    backgroundColor?: string;
  };

  const bgColor = p.selected ? "#6366f1" : (p.backgroundColor ?? "#f3f4f6");
  const textColor = p.selected ? "#ffffff" : "#374151";
  const hasRemove = !!element.on?.remove;

  return (
    <Pressable
      onPress={() => emit("press")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: bgColor,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontSize: 14, color: textColor }}>{p.label}</Text>
      {hasRemove && (
        <Pressable onPress={() => emit("remove")} style={{ marginLeft: 4 }}>
          <Text style={{ fontSize: 14, color: textColor, fontWeight: "700" }}>
            x
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

// =============================================================================
// Input Components
// =============================================================================

const buttonVariantStyles: Record<
  string,
  { bg: string; text: string; border?: string }
> = {
  primary: { bg: "#3b82f6", text: "#ffffff" },
  secondary: { bg: "#6b7280", text: "#ffffff" },
  danger: { bg: "#dc2626", text: "#ffffff" },
  outline: { bg: "transparent", text: "#3b82f6", border: "#3b82f6" },
  ghost: { bg: "transparent", text: "#374151" },
};

const buttonSizeStyles: Record<
  string,
  { paddingH: number; paddingV: number; fontSize: number }
> = {
  sm: { paddingH: 12, paddingV: 6, fontSize: 13 },
  md: { paddingH: 16, paddingV: 10, fontSize: 15 },
  lg: { paddingH: 24, paddingV: 14, fontSize: 17 },
};

function ButtonComponent({ element, emit }: ComponentRenderProps) {
  const p = element.props as {
    label: string;
    variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    loading?: boolean;
  };

  const variant = buttonVariantStyles[p.variant ?? "primary"] ?? {
    bg: "#3b82f6",
    text: "#ffffff",
  };
  const size = buttonSizeStyles[p.size ?? "md"] ?? {
    paddingH: 16,
    paddingV: 10,
    fontSize: 15,
  };
  const disabled = p.disabled || p.loading;

  return (
    <Pressable
      disabled={disabled}
      onPress={() => emit("press")}
      style={({ pressed }) => ({
        backgroundColor: variant.bg,
        paddingHorizontal: size.paddingH,
        paddingVertical: size.paddingV,
        borderRadius: 8,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        flexDirection: "row" as const,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        borderWidth: variant.border ? 1 : 0,
        borderColor: variant.border,
        alignSelf: "flex-start" as const,
      })}
    >
      {p.loading && (
        <ActivityIndicator
          size="small"
          color={variant.text}
          style={{ marginRight: 8 }}
        />
      )}
      <Text
        style={{
          color: variant.text,
          fontSize: size.fontSize,
          fontWeight: "600",
        }}
      >
        {p.label}
      </Text>
    </Pressable>
  );
}

function TextInputComponent({ element, bindings }: ComponentRenderProps) {
  const p = element.props as {
    placeholder?: string;
    value?: string;
    secureTextEntry?: boolean;
    keyboardType?:
      | "default"
      | "email-address"
      | "numeric"
      | "phone-pad"
      | "url";
    multiline?: boolean;
    numberOfLines?: number;
    label?: string;
    flex?: number;
  };

  const [boundValue, setBoundValue] = useBoundProp<string>(
    p.value as string | undefined,
    bindings?.value,
  );
  const displayValue = boundValue ?? "";

  return (
    <View style={p.flex != null ? { flex: p.flex } : undefined}>
      {p.label && <Text style={inputStyles.label}>{p.label}</Text>}
      <RNTextInput
        placeholder={p.placeholder ?? undefined}
        value={displayValue}
        onChangeText={bindings?.value ? setBoundValue : undefined}
        secureTextEntry={p.secureTextEntry ?? false}
        keyboardType={p.keyboardType ?? "default"}
        multiline={p.multiline ?? false}
        numberOfLines={p.numberOfLines ?? undefined}
        style={[
          inputStyles.input,
          p.multiline && {
            minHeight: (p.numberOfLines ?? 3) * 20,
            textAlignVertical: "top" as const,
          },
        ]}
      />
    </View>
  );
}

function SwitchComponent({ element, bindings }: ComponentRenderProps) {
  const p = element.props as {
    checked?: boolean;
    label?: string;
    disabled?: boolean;
  };

  const [checked, setChecked] = useBoundProp<boolean>(
    p.checked as boolean | undefined,
    bindings?.checked,
  );
  const displayValue = checked ?? false;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <RNSwitch
        value={displayValue}
        onValueChange={bindings?.checked ? setChecked : undefined}
        disabled={p.disabled ?? false}
      />
      {p.label && (
        <Text style={{ fontSize: 16, color: "#374151" }}>{p.label}</Text>
      )}
    </View>
  );
}

function CheckboxComponent({ element, bindings }: ComponentRenderProps) {
  const p = element.props as {
    checked?: boolean;
    label?: string;
    disabled?: boolean;
  };

  const [checked, setChecked] = useBoundProp<boolean>(
    p.checked as boolean | undefined,
    bindings?.checked,
  );
  const isChecked = checked ?? false;

  return (
    <Pressable
      disabled={p.disabled ?? false}
      onPress={() => {
        if (bindings?.checked) {
          setChecked(!isChecked);
        }
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: p.disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: isChecked ? "#3b82f6" : "#d1d5db",
          backgroundColor: isChecked ? "#3b82f6" : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isChecked && (
          <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "700" }}>
            {"✓"}
          </Text>
        )}
      </View>
      {p.label && (
        <Text style={{ fontSize: 16, color: "#374151" }}>{p.label}</Text>
      )}
    </Pressable>
  );
}

function SliderComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    label?: string;
    color?: string;
  };

  const min = p.min ?? 0;
  const max = p.max ?? 100;
  const value = p.value ?? min;
  const progress = max > min ? (value - min) / (max - min) : 0;
  const trackColor = p.color ?? "#3b82f6";

  return (
    <View>
      {p.label && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <Text style={{ fontSize: 14, color: "#374151" }}>{p.label}</Text>
          <Text style={{ fontSize: 14, color: "#6b7280" }}>{value}</Text>
        </View>
      )}
      <View
        style={{
          height: 6,
          backgroundColor: "#e5e7eb",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.min(Math.max(progress * 100, 0), 100)}%`,
            height: "100%",
            backgroundColor: trackColor,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

function SearchBarComponent({ element, emit }: ComponentRenderProps) {
  const p = element.props as {
    placeholder?: string;
    value?: string;
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f3f4f6",
        borderRadius: 8,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: 16, color: "#9ca3af", marginRight: 8 }}>
        {"Search"}
      </Text>
      <RNTextInput
        placeholder={p.placeholder ?? "Search..."}
        value={p.value ?? undefined}
        returnKeyType="search"
        onSubmitEditing={() => emit("submit")}
        style={{
          flex: 1,
          paddingVertical: 10,
          fontSize: 16,
          color: "#111827",
        }}
      />
    </View>
  );
}

// =============================================================================
// Feedback Components
// =============================================================================

function SpinnerComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    size?: "small" | "large";
    color?: string;
  };

  return (
    <ActivityIndicator size={p.size ?? "small"} color={p.color ?? "#3b82f6"} />
  );
}

function ProgressBarComponent({ element }: ComponentRenderProps) {
  const p = element.props as {
    progress: number;
    color?: string;
    trackColor?: string;
    height?: number;
  };

  const height = p.height ?? 6;
  const progress = Math.min(Math.max(p.progress, 0), 1);

  return (
    <View
      style={{
        height,
        backgroundColor: p.trackColor ?? "#e5e7eb",
        borderRadius: height / 2,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${progress * 100}%`,
          height: "100%",
          backgroundColor: p.color ?? "#3b82f6",
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

// =============================================================================
// Composite Components
// =============================================================================

function CardComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    title?: string;
    subtitle?: string;
    padding?: number;
    backgroundColor?: string;
    borderRadius?: number;
    elevated?: boolean;
  };

  const elevated = p.elevated !== false;
  const padding = p.padding ?? 16;

  return (
    <View
      style={[
        {
          backgroundColor: p.backgroundColor ?? "#ffffff",
          borderRadius: p.borderRadius ?? 12,
          padding,
        },
        elevated && {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        },
      ]}
    >
      {p.title && (
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: "#111827",
            marginBottom: p.subtitle ? 2 : 12,
          }}
        >
          {p.title}
        </Text>
      )}
      {p.subtitle && (
        <Text
          style={{
            fontSize: 14,
            color: "#6b7280",
            marginBottom: 12,
          }}
        >
          {p.subtitle}
        </Text>
      )}
      {children}
    </View>
  );
}

function ListItemComponent({ element, emit }: ComponentRenderProps) {
  const p = element.props as {
    title: string;
    subtitle?: string;
    leading?: string;
    trailing?: string;
    showChevron?: boolean;
  };

  const hasPress = !!element.on?.press;

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
      }}
    >
      {p.leading && (
        <Text
          style={{
            fontSize: 16,
            color: "#6b7280",
            marginRight: 12,
            width: 24,
            textAlign: "center",
          }}
        >
          {p.leading}
        </Text>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: "#111827" }}>{p.title}</Text>
        {p.subtitle && (
          <Text style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>
            {p.subtitle}
          </Text>
        )}
      </View>
      {p.trailing && (
        <Text style={{ fontSize: 14, color: "#6b7280", marginLeft: 8 }}>
          {p.trailing}
        </Text>
      )}
      {p.showChevron && (
        <Text style={{ fontSize: 16, color: "#9ca3af", marginLeft: 8 }}>
          {">"}
        </Text>
      )}
    </View>
  );

  if (hasPress) {
    return (
      <Pressable
        onPress={() => emit("press")}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
          backgroundColor: pressed ? "#f9fafb" : "transparent",
        })}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

function ModalComponent({ element, children }: ComponentRenderProps) {
  const p = element.props as {
    visible: boolean;
    title?: string;
    animationType?: "slide" | "fade" | "none";
  };

  return (
    <RNModal
      visible={p.visible}
      animationType={p.animationType ?? "slide"}
      transparent
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.content}>
          {p.title && <Text style={modalStyles.title}>{p.title}</Text>}
          {children}
        </View>
      </View>
    </RNModal>
  );
}

// =============================================================================
// Standard Action Handlers
// =============================================================================

/**
 * Create standard action handlers for React Native.
 *
 * @param options - Configuration for standard actions
 * @returns Action handler map compatible with ActionProvider
 */
export function createStandardActionHandlers(options?: {
  /** Navigation function - called by navigate and goBack actions */
  navigate?: (screen: string, params?: Record<string, unknown>) => void;
  /** Go back function */
  goBack?: () => void;
  /** Called when setData action is triggered */
  onSetData?: (path: string, value: unknown) => void;
  /** Called when refresh action is triggered */
  onRefresh?: (target?: string) => void;
}): Record<string, (params: Record<string, unknown>) => Promise<void>> {
  return {
    navigate: async (params) => {
      const screen = params.screen as string;
      const navParams = params.params as Record<string, unknown> | undefined;
      options?.navigate?.(screen, navParams ?? undefined);
    },

    goBack: async () => {
      options?.goBack?.();
    },

    showAlert: async (params) => {
      const title = params.title as string;
      const message = (params.message as string) ?? undefined;
      const buttons = params.buttons as
        | Array<{
            text: string;
            style?: "default" | "cancel" | "destructive";
            action?: string;
          }>
        | undefined;

      const alertButtons = buttons?.map((btn) => ({
        text: btn.text,
        style: btn.style as "default" | "cancel" | "destructive" | undefined,
      }));

      Alert.alert(title, message, alertButtons);
    },

    share: async (params) => {
      const message = params.message as string;
      const url = (params.url as string) ?? undefined;
      const title = (params.title as string) ?? undefined;

      await Share.share({ message, url, title });
    },

    openURL: async (params) => {
      const url = params.url as string;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    },

    setData: async (params) => {
      const statePath = params.statePath as string;
      const value = params.value;
      options?.onSetData?.(statePath, value);
    },

    refresh: async (params) => {
      const target = (params.target as string) ?? undefined;
      options?.onRefresh?.(target);
    },
  };
}

// =============================================================================
// Standard Components Registry
// =============================================================================

/**
 * Standard component registry with all built-in React Native components.
 * Pass to Renderer or merge with custom components.
 */
export const standardComponents: ComponentRegistry = {
  // Layout
  Container: ContainerComponent,
  Row: RowComponent,
  Column: ColumnComponent,
  ScrollContainer: ScrollContainerComponent,
  SafeArea: SafeAreaComponent,
  Pressable: PressableComponent,
  Spacer: SpacerComponent,
  Divider: DividerComponent,
  // Content
  Heading: HeadingComponent,
  Paragraph: ParagraphComponent,
  Label: LabelComponent,
  Image: ImageComponent,
  Avatar: AvatarComponent,
  Badge: BadgeComponent,
  Chip: ChipComponent,
  // Input
  Button: ButtonComponent,
  TextInput: TextInputComponent,
  Switch: SwitchComponent,
  Checkbox: CheckboxComponent,
  Slider: SliderComponent,
  SearchBar: SearchBarComponent,
  // Feedback
  Spinner: SpinnerComponent,
  ProgressBar: ProgressBarComponent,
  // Composite
  Card: CardComponent,
  ListItem: ListItemComponent,
  Modal: ModalComponent,
};

// =============================================================================
// Shared Styles
// =============================================================================

const inputStyles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: "80%",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
});
