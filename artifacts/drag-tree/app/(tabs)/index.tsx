import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { ChristmasTree } from "@/components/ChristmasTree";
import { ReactionDisplay } from "@/components/ReactionDisplay";
import { HistoryList } from "@/components/HistoryList";
import { useTreeSession } from "@/hooks/useTreeSession";
import { useColors } from "@/hooks/useColors";

function getButtonLabel(phase: string): string {
  switch (phase) {
    case "idle": return "STAGE";
    case "staging":
    case "countdown":
    case "go": return "LAUNCH";
    case "result": return "RESET";
    case "redlight": return "RESET";
    default: return "STAGE";
  }
}

function getStatusLabel(phase: string): string {
  switch (phase) {
    case "idle": return "READY TO STAGE";
    case "staging": return "STAGING...";
    case "countdown": return "WATCH THE LIGHTS";
    case "go": return "GO  GO  GO";
    case "result": return "TAP TO RESET";
    case "redlight": return "TAP TO RESET";
    default: return "";
  }
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    phase,
    tree,
    mode,
    switchMode,
    reactionTime,
    grade,
    records,
    bestTime,
    handleLaunch,
    reset,
  } = useTreeSession();

  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handleLaunch();
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 8, paddingBottom: bottomPad + 20 },
      ]}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.appTitle, { color: colors.foreground }]}>DRAG TREE</Text>
        {bestTime !== null && (
          <View style={styles.bestBadge}>
            <Ionicons name="trophy" size={11} color={colors.primary} />
            <Text style={[styles.bestText, { color: colors.primary }]}>
              {bestTime.toFixed(3)}
            </Text>
          </View>
        )}
      </View>

      {/* Mode selector */}
      <View style={[styles.modeRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable
          style={[
            styles.modeBtn,
            mode === "pro" && { backgroundColor: colors.primary },
          ]}
          onPress={() => switchMode("pro")}
        >
          <Text
            style={[
              styles.modeBtnText,
              { color: mode === "pro" ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            PRO (.4s)
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.modeBtn,
            mode === "full" && { backgroundColor: colors.primary },
          ]}
          onPress={() => switchMode("full")}
        >
          <Text
            style={[
              styles.modeBtnText,
              { color: mode === "full" ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            FULL (.5s)
          </Text>
        </Pressable>
      </View>

      {/* Tree */}
      <View style={styles.treeContainer}>
        <View style={[styles.treePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ChristmasTree state={tree} lightSize={56} />
        </View>
      </View>

      {/* Reaction time display */}
      <ReactionDisplay reactionTime={reactionTime} grade={grade} />

      {/* Status label */}
      <Text
        style={[
          styles.status,
          {
            color: phase === "go" ? colors.greenOn : colors.mutedForeground,
          },
        ]}
      >
        {getStatusLabel(phase)}
      </Text>

      {/* Launch button */}
      <Pressable
        style={({ pressed }) => [
          styles.launchBtn,
          {
            backgroundColor:
              phase === "go"
                ? colors.greenOn
                : phase === "redlight"
                ? colors.redOn
                : colors.primary,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            shadowColor:
              phase === "go"
                ? colors.greenOn
                : phase === "redlight"
                ? colors.redOn
                : colors.primary,
          },
        ]}
        onPress={onPress}
      >
        <Text style={[styles.launchBtnText, { color: colors.primaryForeground }]}>
          {getButtonLabel(phase)}
        </Text>
      </Pressable>

      {/* History */}
      <View style={styles.historySection}>
        <HistoryList records={records} onClear={reset} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 24,
    marginBottom: 16,
    gap: 10,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    letterSpacing: 6,
    fontFamily: "Inter_700Bold",
  },
  bestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
  },
  bestText: {
    fontSize: 12,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  modeRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 20,
  },
  modeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },
  treeContainer: {
    marginBottom: 20,
  },
  treePanel: {
    paddingVertical: 24,
    paddingHorizontal: 36,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  status: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 3,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 16,
    height: 18,
  },
  launchBtn: {
    paddingVertical: 18,
    paddingHorizontal: 64,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 24,
  },
  launchBtnText: {
    fontSize: 18,
    fontWeight: "700" as const,
    letterSpacing: 4,
    fontFamily: "Inter_700Bold",
  },
  historySection: {
    width: "100%",
  },
});
