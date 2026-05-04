import React, { useState, useSyncExternalStore } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
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
import { FooterLinks } from "@/components/FooterLinks";
import { useTreeSession } from "@/hooks/useTreeSession";
import { useAccelerometer, SENSITIVITY_THRESHOLDS, type LaunchSensitivity } from "@/hooks/useAccelerometer";
import { useColors } from "@/hooks/useColors";
import { launchTelemetry } from "@/lib/launchTelemetry";
import { settings } from "@/lib/settings";
import { coachingHint } from "@/lib/coaching";

type SensKey = LaunchSensitivity | "custom";
const SENSITIVITY_OPTIONS: { key: SensKey; label: string; sub: string }[] = [
  { key: "gentle", label: "GENTLE", sub: "0.15g" },
  { key: "normal", label: "NORMAL", sub: "0.25g" },
  { key: "hard",   label: "HARD",   sub: "0.46g" },
  { key: "custom", label: "CUSTOM", sub: "adj."  },
];

function getStatusLabel(phase: string): string {
  switch (phase) {
    case "idle":      return "READY";
    case "staging":   return "STAGING...";
    case "countdown": return "WATCH THE TREE";
    case "go":        return "FLOOR  IT";
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
  const [sensitivity, setSensitivity] = useState<SensKey>("normal");
  const appSettings = useSyncExternalStore(settings.subscribe, settings.get, settings.get);
  const showFloorIt      = appSettings.showFloorIt;
  const sensorEnabled    = appSettings.sensorEnabled;
  const treeMode         = appSettings.treeMode;
  const customThreshold  = appSettings.customThreshold;
  // Resolved threshold in m/s² — presets look up from the table, custom uses the stored value.
  const thresholdValue: number =
    sensitivity === "custom"
      ? customThreshold
      : SENSITIVITY_THRESHOLDS[sensitivity as LaunchSensitivity];

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
    getGreenAt,
    clearHistory,
    switchMode,
  } = useTreeSession();

  // Keep the session's tree mode in sync with the settings store.
  // switchMode also calls reset(), so switching while idle is clean;
  // the sessionLocked guard in Settings prevents switching mid-run.
  React.useEffect(() => {
    switchMode(treeMode);
  }, [treeMode]);

  const { currentG, isAvailable, simulateLaunch, simulateRedLight } = useAccelerometer({
    // Gate sensor on both phase and the Motion Sensor toggle.
    // When sensorEnabled=false the subscription is idle and taps take over.
    armed: isArmed && sensorEnabled,
    threshold: thresholdValue,
    onLaunch: (candidateTime: number) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerLaunch(candidateTime);
    },
    onRedLight: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      triggerRedLight();
    },
    watchForRedLight: isWatchingRedLight && sensorEnabled,
    onLaunchTelemetry: (t) => {
      // Combine sensor telemetry with the live greenAt and write to the
      // shared store so the Diagnostics screen can render a real-launch
      // breakdown (greenAt → onset → threshold → confirm).
      const greenAt = getGreenAt();
      launchTelemetry.set({
        capturedAt: performance.now(),
        greenAt,
        onsetTime: t.onsetTime,
        thresholdTime: t.thresholdTime,
        confirmTime: t.confirmTime,
        peakG: t.peakG,
        sampleIntervalMean: t.sampleIntervalMean,
        greenToOnsetMs: greenAt != null ? t.onsetTime - greenAt : null,
        onsetToThresholdMs: t.thresholdTime - t.onsetTime,
        thresholdToConfirmMs: t.confirmTime - t.thresholdTime,
        rewindMs: t.confirmTime - t.onsetTime,
        source: t.source,
      });
    },
  });

  // Tap routing: in simulation mode (no sensor OR practice-mode override)
  // the on-screen button drives launches and red-lights. With the real
  // sensor armed, taps during the active sequence are ignored — the
  // accelerometer fires those events.
  const onMainPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (phase === "idle") {
      startSequence();
    } else if (phase === "result" || phase === "redlight") {
      reset();
    } else if (phase === "go") {
      if (useSimulation) simulateLaunch();
    } else if (phase === "staging" || phase === "countdown") {
      if (useSimulation) simulateRedLight();
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

  // Lock the Practice Mode toggle (in Settings) while a run is active so the
  // user can't change modes mid-sequence and end up in a half-armed state.
  React.useEffect(() => {
    settings.set({ sessionLocked: isActive });
    return () => { settings.set({ sessionLocked: false }); };
  }, [isActive]);

  // sensorActive: sensor hardware present AND enabled in settings.
  // useSimulation: tap input is active — either FLOOR IT button is on,
  // or the sensor isn't active (not available or disabled).
  const sensorActive  = isAvailable && sensorEnabled;
  const useSimulation = !sensorActive || showFloorIt;

  const gColor =
    currentG > 0.8 ? colors.greenOn :
    currentG > 0.3 ? colors.primary :
    colors.mutedForeground;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Button appearance
  const btnBg =
    isDone                               ? colors.secondary :
    phase === "go"   && useSimulation    ? colors.greenOn :
    phase === "go"   && !useSimulation   ? "transparent" :
    isActive         && !useSimulation   ? "transparent" :
    isActive         && useSimulation    ? colors.card :
    colors.primary;

  const btnBorder =
    (phase === "go" && !useSimulation) || (isActive && !useSimulation) ? colors.border : "transparent";

  const btnLabel =
    isDone                            ? "RESET"      :
    phase === "go" && useSimulation   ? "FLOOR IT"   :
    phase === "go" && !useSimulation  ? "ARMED"      :
    isActive       && useSimulation   ? "RED LIGHT"  :
    isActive       && !useSimulation  ? "ARMED"      :
    "STAGE";

  const btnTextColor =
    isDone                            ? colors.foreground         :
    phase === "go" && useSimulation   ? colors.primaryForeground  :
    phase === "go" && !useSimulation  ? colors.mutedForeground    :
    isActive       && useSimulation   ? colors.redOn              :
    isActive                          ? colors.mutedForeground    :
    colors.primaryForeground;

  const btnDisabled = isActive && !useSimulation;

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
        <Text style={[styles.appTitle, { color: colors.foreground }]}>DRAGTREE</Text>
        <View style={styles.badges}>
          {bestTime !== null && (
            <View style={[styles.badge, { backgroundColor: "rgba(245,166,35,0.12)" }]}>
              <Ionicons name="trophy" size={10} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>{bestTime.toFixed(3)}</Text>
            </View>
          )}
          {sensorActive && (
            <View style={[styles.badge, { borderColor: colors.greenOn, borderWidth: 1 }]}>
              <MaterialCommunityIcons name="car-speed-limiter" size={10} color={colors.greenOn} />
              <Text style={[styles.badgeText, { color: colors.greenOn }]}>ACCEL</Text>
            </View>
          )}
          {showFloorIt && (
            <View style={[styles.badge, { borderColor: colors.primary, borderWidth: 1 }]}>
              <MaterialCommunityIcons name="gesture-tap" size={10} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>FLOOR IT</Text>
            </View>
          )}
          <Pressable
            onPress={() => {
              if (isActive) return;
              Haptics.selectionAsync();
              // typed-routes manifest regenerates at expo start; cast until then
              router.push("/diagnostic" as never);
            }}
            disabled={isActive}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            accessibilityHint="Open the settings and sensor diagnostics screen"
            style={({ pressed }) => [
              styles.badge,
              {
                borderColor: colors.border,
                borderWidth: 1,
                opacity: pressed ? 0.6 : isActive ? 0.4 : 1,
              },
            ]}
          >
            <Ionicons name="settings-outline" size={10} color={colors.mutedForeground} />
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>SET</Text>
          </Pressable>
        </View>
      </View>

      {/* Tree mode banner */}
      <View style={[styles.proLabel, { borderColor: colors.border }]}>
        <Text style={[styles.proText, { color: colors.mutedForeground }]}>
          {treeMode === "pro" ? "PRO TREE  •  0.400s" : "SPORTSMAN  •  0.500s"}
        </Text>
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
          {getStatusLabel(phase)}
        </Animated.Text>

        {isActive && (
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
            borderWidth: btnBorder !== "transparent" ? 1 : 0,
            borderColor: btnBorder,
            opacity: pressed ? 0.82 : btnDisabled ? 0.4 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            shadowColor: phase === "idle" ? colors.primary : phase === "go" && useSimulation ? colors.greenOn : "transparent",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5,
            shadowRadius: 14,
            elevation: phase === "idle" || (phase === "go" && useSimulation) ? 10 : 0,
          },
        ]}
        onPress={onMainPress}
        disabled={btnDisabled}
        accessibilityRole="button"
        accessibilityLabel={btnLabel}
        accessibilityState={{ disabled: btnDisabled }}
      >
        <Text style={[styles.mainBtnText, { color: btnTextColor }]}>
          {btnLabel}
        </Text>
      </Pressable>

      {/* Sensor sensitivity picker — show when idle/done */}
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
              accessibilityRole="button"
              accessibilityLabel={`Set launch sensitivity to ${opt.label.toLowerCase()}, ${opt.sub}`}
              accessibilityState={{ selected: sensitivity === opt.key }}
            >
              <Text style={[styles.sensBtnLabel, { color: sensitivity === opt.key ? colors.foreground : colors.mutedForeground }]}>
                {opt.label}
              </Text>
              <Text style={[styles.sensBtnSub, { color: colors.mutedForeground }]}>
                {opt.key === "custom" ? `${(customThreshold / 9.81).toFixed(2)}g` : opt.sub}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Custom threshold stepper — shown when CUSTOM is selected */}
      {sensitivity === "custom" && isAvailable && !isActive && (
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              settings.set({
                customThreshold: Math.max(0.8, Math.round((customThreshold - 0.1) * 10) / 10),
              });
            }}
            hitSlop={10}
            style={[styles.stepBtn, { borderColor: colors.border }]}
            accessibilityLabel="Decrease launch threshold"
          >
            <Text style={[styles.stepBtnText, { color: colors.foreground }]}>−</Text>
          </Pressable>
          <View style={styles.stepValue}>
            <Text style={[styles.stepValMain, { color: colors.foreground }]}>
              {customThreshold.toFixed(1)} m/s²
            </Text>
            <Text style={[styles.stepValSub, { color: colors.mutedForeground }]}>
              {(customThreshold / 9.81).toFixed(2)}g
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              settings.set({
                customThreshold: Math.min(6.0, Math.round((customThreshold + 0.1) * 10) / 10),
              });
            }}
            hitSlop={10}
            style={[styles.stepBtn, { borderColor: colors.border }]}
            accessibilityLabel="Increase launch threshold"
          >
            <Text style={[styles.stepBtnText, { color: colors.foreground }]}>+</Text>
          </Pressable>
        </View>
      )}

      {/* Contextual hint */}
      {phase === "idle" && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {sensorActive && showFloorIt
            ? "Sensor armed — tap FLOOR IT or launch to detect"
            : sensorActive
            ? "Floor it when green — sensor detects your launch"
            : showFloorIt
            ? "Tap FLOOR IT when the green lights"
            : "Enable the sensor or FLOOR IT button in Settings"}
        </Text>
      )}
      {showFloorIt && phase === "countdown" && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Tap RED LIGHT to simulate an early launch
        </Text>
      )}

      {/* Subtle coaching hint — only fires after a repeating mistake pattern */}
      {isDone && (() => {
        const tip = coachingHint(records);
        return tip ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, fontStyle: "italic" }]}>
            {tip}
          </Text>
        ) : null;
      })()}

      {/* History */}
      <View style={styles.history}>
        <HistoryList records={records} onClear={clearHistory} />
      </View>

      {/* Footer: privacy + source links */}
      <FooterLinks />
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
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    lineHeight: 26,
  },
  stepValue: {
    alignItems: "center",
    minWidth: 108,
  },
  stepValMain: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    fontVariant: ["tabular-nums"],
  },
  stepValSub: {
    fontSize: 11,
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
