import React, { useState } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { ChristmasTree } from "@/components/ChristmasTree";
import { ReactionDisplay } from "@/components/ReactionDisplay";
import { HistoryList } from "@/components/HistoryList";
import { useTreeSession } from "@/hooks/useTreeSession";
import { useAccelerometer, type LaunchSensitivity } from "@/hooks/useAccelerometer";
import { useColors } from "@/hooks/useColors";

const SENSITIVITY_LABELS: Record<LaunchSensitivity, string> = {
  gentle: "GENTLE",
  normal: "NORMAL",
  hard: "HARD",
};

function getStatusLabel(phase: string, sensorAvailable: boolean): string {
  switch (phase) {
    case "idle": return "TAP STAGE TO BEGIN";
    case "staging": return "STAGING...";
    case "countdown": return sensorAvailable ? "WATCH THE TREE" : "WATCH THE TREE";
    case "go": return sensorAvailable ? "FLOOR  IT" : "TAP  NOW";
    case "result": return "TAP TO RESET";
    case "redlight": return "TAP TO RESET";
    default: return "";
  }
}

function GaugeMeter({ value, color }: { value: number; color: string }) {
  const pct = Math.min(value / 1.5, 1);
  const width = useSharedValue(0);

  React.useEffect(() => {
    width.value = withTiming(pct, { duration: 80, easing: Easing.out(Easing.quad) });
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as unknown as number,
  }));

  return (
    <View style={gaugeStyles.track}>
      <Animated.View style={[gaugeStyles.bar, { backgroundColor: color }, barStyle]} />
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: "#1e1e1e",
    borderRadius: 2,
    overflow: "hidden",
    width: "100%",
  },
  bar: {
    height: 4,
    borderRadius: 2,
  },
});

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [sensitivity, setSensitivity] = useState<LaunchSensitivity>("normal");

  const {
    phase,
    tree,
    mode,
    switchMode,
    reactionTime,
    grade,
    records,
    bestTime,
    handleManualLaunch,
    startSequence,
    reset,
    triggerLaunch,
    triggerRedLight,
    isArmed,
    isWatchingRedLight,
  } = useTreeSession();

  const { currentG, isAvailable } = useAccelerometer({
    armed: isArmed,
    sensitivity,
    onLaunch: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerLaunch();
    },
    onRedLight: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      triggerRedLight();
    },
    watchForRedLight: isWatchingRedLight,
  });

  const onStagePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (phase === "idle") {
      startSequence();
    } else if (phase === "result" || phase === "redlight") {
      reset();
    } else if (!isAvailable) {
      // Web fallback: manual tap
      handleManualLaunch();
    }
  };

  // Pulsing animation for "armed" state
  const pulseOpacity = useSharedValue(1);
  React.useEffect(() => {
    if (isArmed) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 400, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isArmed]);

  const armedTextStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const gColor =
    currentG > 0.8 ? colors.greenOn :
    currentG > 0.4 ? colors.primary :
    colors.mutedForeground;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const showStageBtnAsReset = phase === "result" || phase === "redlight";
  const showStageBtnAsActive = phase === "idle";
  const showStageBtnDisabled = phase === "staging" || phase === "countdown" || phase === "go";

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
        <View style={styles.headerRight}>
          {bestTime !== null && (
            <View style={styles.bestBadge}>
              <Ionicons name="trophy" size={11} color={colors.primary} />
              <Text style={[styles.bestText, { color: colors.primary }]}>
                {bestTime.toFixed(3)}
              </Text>
            </View>
          )}
          {isAvailable && (
            <View style={[styles.sensorBadge, { borderColor: colors.greenOn }]}>
              <MaterialCommunityIcons name="car-speed-limiter" size={11} color={colors.greenOn} />
              <Text style={[styles.sensorText, { color: colors.greenOn }]}>SENSOR</Text>
            </View>
          )}
        </View>
      </View>

      {/* Mode + Sensitivity row */}
      <View style={styles.controlRow}>
        <View style={[styles.segmentedControl, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {(["pro", "full"] as const).map(m => (
            <Pressable
              key={m}
              style={[styles.segmentBtn, mode === m && { backgroundColor: colors.primary }]}
              onPress={() => switchMode(m)}
            >
              <Text style={[styles.segmentText, { color: mode === m ? colors.primaryForeground : colors.mutedForeground }]}>
                {m === "pro" ? "PRO .4s" : "FULL .5s"}
              </Text>
            </Pressable>
          ))}
        </View>

        {isAvailable && (
          <View style={[styles.segmentedControl, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {(["gentle", "normal", "hard"] as LaunchSensitivity[]).map(s => (
              <Pressable
                key={s}
                style={[styles.segmentBtn, sensitivity === s && { backgroundColor: colors.secondary }]}
                onPress={() => setSensitivity(s)}
              >
                <Text style={[styles.segmentText, { color: sensitivity === s ? colors.foreground : colors.mutedForeground }]}>
                  {SENSITIVITY_LABELS[s][0]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Sensitivity label */}
      {isAvailable && (
        <Text style={[styles.sensitivityLabel, { color: colors.mutedForeground }]}>
          LAUNCH SENSITIVITY: {SENSITIVITY_LABELS[sensitivity]}
        </Text>
      )}

      {/* Tree */}
      <View style={styles.treeContainer}>
        <View style={[styles.treePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ChristmasTree state={tree} lightSize={56} />
        </View>
      </View>

      {/* Reaction time display */}
      <ReactionDisplay reactionTime={reactionTime} grade={grade} />

      {/* Status + G-meter */}
      <View style={styles.statusSection}>
        <Animated.Text
          style={[
            styles.status,
            {
              color: phase === "go"
                ? colors.greenOn
                : phase === "redlight"
                ? colors.redOn
                : colors.mutedForeground,
            },
            armedTextStyle,
          ]}
        >
          {getStatusLabel(phase, isAvailable)}
        </Animated.Text>

        {isAvailable && (phase === "go" || phase === "staging" || phase === "countdown") && (
          <View style={styles.gMeter}>
            <GaugeMeter value={currentG} color={gColor} />
            <Text style={[styles.gValue, { color: gColor }]}>
              {currentG.toFixed(2)}g
            </Text>
          </View>
        )}
      </View>

      {/* Stage / Reset button */}
      <Pressable
        style={({ pressed }) => [
          styles.stageBtn,
          {
            backgroundColor: showStageBtnAsReset
              ? colors.secondary
              : showStageBtnDisabled && isAvailable
              ? "transparent"
              : colors.primary,
            borderWidth: showStageBtnDisabled && isAvailable ? 1 : 0,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : showStageBtnDisabled && isAvailable ? 0.4 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            shadowColor: showStageBtnAsActive ? colors.primary : "transparent",
          },
        ]}
        onPress={onStagePress}
        disabled={showStageBtnDisabled && isAvailable}
      >
        <Text style={[
          styles.stageBtnText,
          {
            color: showStageBtnAsReset
              ? colors.foreground
              : showStageBtnDisabled
              ? colors.mutedForeground
              : colors.primaryForeground,
          },
        ]}>
          {showStageBtnAsReset ? "RESET" : showStageBtnDisabled ? "ARMED" : "STAGE"}
        </Text>
      </Pressable>

      {/* Web fallback note */}
      {!isAvailable && (phase === "go" || phase === "staging" || phase === "countdown") && (
        <Text style={[styles.fallbackNote, { color: colors.mutedForeground }]}>
          Tap button above to launch
        </Text>
      )}

      {/* Sensor info */}
      {isAvailable && phase === "idle" && (
        <Text style={[styles.sensorInfo, { color: colors.mutedForeground }]}>
          Accelerometer armed — floor it when green
        </Text>
      )}

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
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  sensorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  sensorText: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },
  controlRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 20,
    width: "100%",
    justifyContent: "center",
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  segmentBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    fontFamily: "Inter_700Bold",
  },
  sensitivityLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
  },
  treeContainer: {
    marginBottom: 16,
  },
  treePanel: {
    paddingVertical: 24,
    paddingHorizontal: 36,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  statusSection: {
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 40,
    marginBottom: 10,
    minHeight: 44,
    gap: 8,
  },
  status: {
    fontSize: 13,
    fontWeight: "700" as const,
    letterSpacing: 4,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  gMeter: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gValue: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    letterSpacing: 0.5,
    minWidth: 38,
    textAlign: "right",
  },
  stageBtn: {
    paddingVertical: 18,
    paddingHorizontal: 64,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 8,
  },
  stageBtnText: {
    fontSize: 18,
    fontWeight: "700" as const,
    letterSpacing: 4,
    fontFamily: "Inter_700Bold",
  },
  fallbackNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  sensorInfo: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  historySection: {
    width: "100%",
    marginTop: 12,
  },
});
