import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Platform,
  Keyboard,
  StyleSheet,
} from "react-native";
import { fetch } from "expo/fetch";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useUIStream } from "@json-render/react-native";
import { AppRenderer } from "../lib/render/renderer";

// Resolve the Metro dev server origin for API route calls.
// expo/fetch doesn't resolve relative URLs like the built-in RN fetch does.
function getApiBaseUrl(): string {
  const debuggerHost =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(":").shift();
    // Metro dev server runs on port 8081 by default
    return `http://${host}:8081`;
  }
  return "http://localhost:8081";
}

const API_BASE = getApiBaseUrl();

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState("");

  const { spec, isStreaming, error, rawLines, send, stop, clear } = useUIStream(
    {
      api: `${API_BASE}/api/generate`,
      fetch,
      validate: true,
      onError: (err) => console.error("Generation error:", err),
    },
  );

  const handleGenerate = async () => {
    if (!prompt.trim() || isStreaming) return;

    const text = prompt.trim();
    setPrompt("");
    Keyboard.dismiss();

    await send(text, {
      previousSpec: spec ?? undefined,
    });
  };

  type ViewMode = "ui" | "json" | "jsonl";
  const [viewMode, setViewMode] = useState<ViewMode>("ui");
  const [showMenu, setShowMenu] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text =
      viewMode === "jsonl"
        ? rawLines.join("\n")
        : JSON.stringify(spec, null, 2);
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [spec, rawLines, viewMode]);

  const handleClear = useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    setShowMenu(false);
    clear();
    setPrompt("");
    setViewMode("ui");
  }, [confirmingClear, clear]);

  const hasContent = !!spec || isStreaming || !!error;

  const PROMPT_BAR_HEIGHT = 80;

  // Animate the floating prompt bar in sync with the keyboard
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: -Math.max(0, e.endCoordinates.height - insets.bottom - 4),
        duration: Platform.OS === "ios" ? e.duration : 200,
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.99),
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === "ios" ? (e.duration ?? 250) : 200,
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.99),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardOffset]);

  return (
    <View style={styles.container}>
      {hasContent ? (
        viewMode !== "ui" ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.contentContainer,
              {
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + PROMPT_BAR_HEIGHT + 16,
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.jsonContainer}>
              <View style={styles.jsonHeader}>
                <Text style={styles.jsonHeaderTitle}>
                  {viewMode === "json" ? "JSON Spec" : "JSONL Stream"}
                </Text>
                <Pressable style={styles.copyButton} onPress={handleCopy}>
                  <Text style={styles.copyButtonText}>
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.jsonText}>
                {viewMode === "json"
                  ? JSON.stringify(spec, null, 2)
                  : rawLines.join("\n")}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <View
            style={[
              styles.flex,
              { paddingBottom: insets.bottom + PROMPT_BAR_HEIGHT + 16 },
            ]}
          >
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorTitle}>Generation failed</Text>
                <Text style={styles.errorText}>{error.message}</Text>
              </View>
            )}

            {(spec || isStreaming) && (
              <AppRenderer spec={spec} loading={isStreaming} />
            )}
          </View>
        )
      ) : (
        <Pressable style={styles.splash} onPress={Keyboard.dismiss}>
          <View style={styles.splashContent}>
            <Text style={styles.splashTitle}>json-render</Text>
            <Text style={styles.splashSubtitle}>
              Describe a UI and watch it appear
            </Text>
            <Text style={styles.splashHint}>
              Try something like "a settings page with a dark mode toggle,
              notification preferences, and a profile card with an avatar"
            </Text>
          </View>
        </Pressable>
      )}

      {/* Menu popover */}
      {showMenu && (
        <Pressable
          style={styles.menuOverlay}
          onPress={() => {
            setShowMenu(false);
            setConfirmingClear(false);
          }}
        >
          <Animated.View
            style={[
              styles.menuPopover,
              { bottom: insets.bottom + 64 },
              { transform: [{ translateY: keyboardOffset }] },
            ]}
          >
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setViewMode((v) => (v === "json" ? "ui" : "json"));
                setShowMenu(false);
              }}
            >
              <Text style={styles.menuItemText}>
                {viewMode === "json" ? "Hide JSON" : "Show JSON"}
              </Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setViewMode((v) => (v === "jsonl" ? "ui" : "jsonl"));
                setShowMenu(false);
              }}
            >
              <Text style={styles.menuItemText}>
                {viewMode === "jsonl" ? "Hide JSONL" : "Show JSONL"}
              </Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={handleClear}>
              <Text
                style={[
                  styles.menuItemText,
                  styles.menuItemDestructive,
                  confirmingClear && styles.menuItemDestructiveConfirm,
                ]}
              >
                {confirmingClear ? "Are you sure?" : "Clear"}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      {/* Prompt bar */}
      <Animated.View
        style={[
          styles.promptArea,
          { bottom: insets.bottom + 12 },
          { transform: [{ translateY: keyboardOffset }] },
        ]}
      >
        <View style={styles.promptBar}>
          <TextInput
            style={styles.promptInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe a UI..."
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={handleGenerate}
            editable
          />
          {hasContent && spec && !isStreaming && (
            <Pressable
              style={styles.menuButton}
              onPress={() => {
                setShowMenu((v) => !v);
                setConfirmingClear(false);
              }}
            >
              <Text style={styles.menuButtonText}>···</Text>
            </Pressable>
          )}
          {isStreaming ? (
            <Pressable style={styles.stopButton} onPress={stop}>
              <View style={styles.stopIcon} />
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.sendButton,
                !prompt.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleGenerate}
              disabled={!prompt.trim()}
            >
              <Text style={styles.sendButtonText}>Go</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  flex: {
    flex: 1,
  },
  splash: {
    flex: 1,
    justifyContent: "center",
  },
  splashContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  splashSubtitle: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 24,
  },
  splashHint: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
  contentContainer: {},
  jsonContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  jsonHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  jsonHeaderTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  copyButton: {
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  jsonText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#374151",
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#dc2626",
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    color: "#991b1b",
  },
  promptArea: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  menuButton: {
    borderRadius: 20,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  menuButtonText: {
    fontSize: 18,
    color: "#9ca3af",
    fontWeight: "700",
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  menuPopover: {
    position: "absolute",
    right: 12,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    minWidth: 160,
    overflow: "hidden",
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  menuItemDestructive: {
    color: "#ef4444",
  },
  menuItemDestructiveConfirm: {
    fontWeight: "700",
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
  },
  promptBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingLeft: 18,
    paddingRight: 4,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  promptInput: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 20,
    paddingHorizontal: 18,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  stopButton: {
    backgroundColor: "#ef4444",
    borderRadius: 20,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: "#ffffff",
    borderRadius: 2,
  },
});
