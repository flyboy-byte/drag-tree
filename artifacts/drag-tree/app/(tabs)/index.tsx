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

const SENSITIVITY_OPTIONS: { key: LaunchSensitivity; label: string; sub: string }[] = [
  { key: "gentle", label: "GENTLE", sub: "0.3g" },
  { key: "normal", label: "NORMAL", sub: "0.56g" },
  { key: "hard",   label: "HARD",   sub: "0.92g" },
];

function getStatusLabel(phase: string, sensorAvailable: boolean): string {
  switch (phase) {
    case "idle":      return "READY";
    case "staging":   return "STAGING...";
    case "countdown": return "WATCH THE TREE";
    case "go":        return sensorAvailable ? "FLOOR  IT" : "TAP  NOW";
    case "result":    return "TAP TO RESET";
    case "redlight":  return "TAP TO RESET";
    default:          return "";
  }
}

function GaugeMeter({ value, color }: { value: number; color: string }) {
  const pct = Math.min(value / 1.5, 1);
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withTiming(pct, { duration: 80, easing: Easing.out(Easing.quad) });
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` as unknown as number }));
  return (
    <View style={gStyles.track}>
      <Animated.View style={[gStyles.bar, { backgroundColor: color }, barStyle]} />
    </View>
  );
}
const gStyles = StyleSheet.create({
  track: { height: 3, backgroundColor: "#1e1e1e", borderRadius: 2, overflow: "hidden", flex: 1 },
  bar: { height: 3, borderRadius: 2 },
});

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [sensitivity, setSensitivity] = useState<LaunchSensitivity>("normal");

  const {
    phase,
    tree,
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

  const onMainPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (phase === "idle") {
      startSequence();
    } else if (phase === "result" || phase === "redlight") {
      reset();
    } else if (!isAvailable) {
      handleManualLaunch();
    }
  };

  // Pulse animation when green is lit
  const pulseOpacity = useSharedValue(1);
  React.useEffect(() => {
    if (isArmed) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 350, easing: Easing.out(Easing.ease) }),
          withTiming(1,    { duration: 350, easing: Easing.in(Easing.ease) }),
        ),
        -1, false,
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isArmed]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const isActive = phase === "staging" || phase === "countdown" || phase === "go";
  const isDone   = phase === "result" || phase === "redlight";

  const gColor =
    currentG > 0.8 ? colors.greenOn :
    currentG > 0.3 ? colors.primary :
    colors.mutedForeground;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const btnBg =
    isDone   ? colors.secondary :
    isActive && isAvailable ? "transparent" :
    phase === "idle" ? colors.primary :
    colors.primary;

  const btnLabel =
    isDone   ? "RESET" :
    isActive  ? (isAvailable ? "ARMED" : "LAUNCH") :
    "STAGE";

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 6, paddingBottom: bottomPad + 20 },
      ]}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.appTitle, { color: colors.foreground }]}>DRAG TREE</Text>
        <View style={styles.badges}>
          {bestTime !== null && (
            <View style={[styles.badge, { backgroundColor: "rgba(245,166,35,0.12)" }]}>
              <Ionicons name="trophy" size={10} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>{bestTime.toFixed(3)}</Text>
            </View>
          )}
          {isAvailable && (
            <View style={[styles.badge, { borderColor: colors.greenOn, borderWidth: 1 }]}>
              <MaterialCommunityIcons name="car-speed-limiter" size={10} color={colors.greenOn} />
              <Text style={[styles.badgeText, { color: colors.greenOn }]}>ACCEL</Text>
            </View>
          )}
        </View>
      </View>

      {/* PRO TREE label */}
      <View style={[styles.proLabel, { borderColor: colors.border }]}>
        <Text style={[styles.proText, { color: colors.mutedForeground }]}>PRO TREE  •  0.400s</Text>
      </View>

      {/* The tree */}
      <View style={styles.treeWrap}>
        <ChristmasTree state={tree} />
      </View>

      {/* Reaction display */}
      <ReactionDisplay reactionTime={reactionTime} grade={grade} />

      {/* Status + G meter */}
      <View style={styles.statusRow}>
        <Animated.Text
          style={[
            styles.status,
            {
              color:
                phase === "go"       ? colors.greenOn :
                phase === "redlight" ? colors.redOn :
                colors.mutedForeground,
            },
            pulseStyle,
          ]}
        >
          {getStatusLabel(phase, isAvailable)}
        </Animated.Text>

        {isAvailable && isActive && (
          <View style={styles.gRow}>
            <GaugeMeter value={currentG} color={gColor} />
            <Text style={[styles.gText, { color: gColor }]}>{currentG.toFixed(2)}g</Text>
          </View>
        )}
      </View>

      {/* Main button */}
      <Pressable
        style={({ pressed }) => [
          styles.mainBtn,
          {
            backgroundColor: btnBg,
            borderWidth: isActive && isAvailable ? 1 : 0,
            borderColor: colors.border,
            opacity: pressed ? 0.82 : isActive && isAvailable ? 0.45 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            shadowColor: phase === "idle" ? colors.primary : "transparent",
          },
        ]}
        onPress={onMainPress}
        disabled={isActive && isAvailable}
      >
        <Text style={[
          styles.mainBtnText,
          {
            color:
              isDone ? colors.foreground :
              isActive ? colors.mutedForeground :
              colors.primaryForeground,
          },
        ]}>
          {btnLabel}
        </Text>
      </Pressable>

      {/* Sensor sensitivity picker */}
      {isAvailable && !isActive && (
        <View style={styles.sensitivityRow}>
          {SENSITIVITY_OPTIONS.map(opt => (
            <Pressable
              key={opt.key}
              style={[
                styles.sensBtn,
                {
                  backgroundColor: sensitivity === opt.key ? colors.secondary : "transparent",
                  borderColor: sensitivity === opt.key ? colors.border : "transparent",
                },
              ]}
              onPress={() => setSensitivity(opt.key)}
            >
              <Text style={[styles.sensBtnLabel, { color: sensitivity === opt.key ? colors.foreground : colors.mutedForeground }]}>
                {opt.label}
              </Text>
              <Text style={[styles.sensBtnSub, { color: colors.mutedForeground }]}>{opt.sub}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!isAvailable && isActive && (
        <Text style={[styles.fallbackHint, { color: colors.mutedForeground }]}>
          Tap the button above to launch
        </Text>
      )}

      {isAvailable && phase === "idle" && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Floor it when green — sensor detects your launch
        </Text>
      )}

      {/* History */}
      <View style={styles.history}>
        <HistoryList records={records} onClear={reset} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    letterSpacing: 6,
    fontFamily: "Inter_700Bold",
  },
  badges: { flexDirection: "row", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  proLabel: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
  },
  proText: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
  },
  treeWrap: {
    marginBottom: 18,
  },
  statusRow: {
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 40,
    minHeight: 38,
    gap: 8,
    marginBottom: 8,
  },
  status: {
    fontSize: 13,
    fontWeight: "700" as const,
    letterSpacing: 4,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  gRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
  },
  gText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    minWidth: 40,
    textAlign: "right",
  },
  mainBtn: {
    paddingVertical: 17,
    paddingHorizontal: 60,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
  },
  mainBtnText: {
    fontSize: 18,
    fontWeight: "700" as const,
    letterSpacing: 4,
    fontFamily: "Inter_700Bold",
  },
  sensitivityRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  sensBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  sensBtnLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },
  sensBtnSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  fallbackHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  hint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
    textAlign: "center",
    paddingHorizontal: 32,
    marginBottom: 8,
  },
  history: {
    width: "100%",
    marginTop: 10,
  },
});
