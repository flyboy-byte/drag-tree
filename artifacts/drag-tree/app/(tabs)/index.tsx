import React, { useSyncExternalStore } from "react";
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
import { RunHistoryChart } from "@/components/RunHistoryChart";
import { FooterLinks } from "@/components/FooterLinks";
import { useTreeSession, type SeriesSummary } from "@/hooks/useTreeSession";
import { useAccelerometer, SENSITIVITY_THRESHOLDS } from "@/hooks/useAccelerometer";
import { useColors } from "@/hooks/useColors";
import { launchTelemetry } from "@/lib/launchTelemetry";
import { settings } from "@/lib/settings";
import { sessionLock } from "@/lib/sessionLock";
import { coachingHint } from "@/lib/coaching";
import { playGreenBeep, playResultTone } from "@/lib/audio";

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

// ── Series summary card ────────────────────────────────────────────────────
function SeriesSummaryCard({ summary }: { summary: SeriesSummary }) {
  const colors = useColors();
  return (
    <View style={[summaryStyles.card, { borderColor: colors.border }]}>
      <Text style={[summaryStyles.header, { color: colors.mutedForeground }]}>
        SERIES DONE · {summary.size} RUNS
      </Text>
      {summary.avgRT !== null ? (
        <>
          <Text style={[summaryStyles.avg, { color: colors.foreground }]}>
            {summary.avgRT.toFixed(3)}s
          </Text>
          <Text style={[summaryStyles.avgLabel, { color: colors.mutedForeground }]}>avg reaction</Text>
        </>
      ) : (
        <Text style={[summaryStyles.noClean, { color: colors.mutedForeground }]}>no clean runs</Text>
      )}
      <View style={summaryStyles.statsRow}>
        {summary.bestRT !== null && (
          <View style={summaryStyles.stat}>
            <Text style={[summaryStyles.statVal, { color: colors.greenOn }]}>{summary.bestRT.toFixed(3)}</Text>
            <Text style={[summaryStyles.statLab, { color: colors.mutedForeground }]}>BEST</Text>
          </View>
        )}
        {summary.worstRT !== null && summary.worstRT !== summary.bestRT && (
          <View style={summaryStyles.stat}>
            <Text style={[summaryStyles.statVal, { color: colors.foreground }]}>{summary.worstRT.toFixed(3)}</Text>
            <Text style={[summaryStyles.statLab, { color: colors.mutedForeground }]}>WORST</Text>
          </View>
        )}
        {summary.redLightCount > 0 && (
          <View style={summaryStyles.stat}>
            <Text style={[summaryStyles.statVal, { color: "#ef4444" }]}>{summary.redLightCount}</Text>
            <Text style={[summaryStyles.statLab, { color: colors.mutedForeground }]}>
              {summary.redLightCount === 1 ? "RED" : "REDS"}
            </Text>
          </View>
        )}
      </View>
      <Text style={[summaryStyles.consistency, { color: colors.primary }]}>
        {summary.consistency.toUpperCase()}
      </Text>
    </View>
  );
}
const summaryStyles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 0,
    gap: 2,
    width: "100%",
  },
  header: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 2,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  avg: {
    fontSize: 48,
    fontWeight: "700" as const,
    letterSpacing: -1,
    fontFamily: "Inter_700Bold",
    lineHeight: 52,
  },
  avgLabel: {
    fontSize: 12,
    fontWeight: "500" as const,
    letterSpacing: 1,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  noClean: {
    fontSize: 16,
    fontWeight: "500" as const,
    fontFamily: "Inter_500Medium",
    marginVertical: 10,
  },
  statsRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  stat: { alignItems: "center", gap: 2 },
  statVal: {
    fontSize: 20,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  statLab: {
    fontSize: 9,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  consistency: {
    fontSize: 13,
    fontWeight: "700" as const,
    letterSpacing: 3,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
});

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const appSettings = useSyncExternalStore(settings.subscribe, settings.get, settings.get);
  const showFloorIt      = appSettings.showFloorIt;
  const sensorEnabled    = appSettings.sensorEnabled;
  const treeMode         = appSettings.treeMode;
  const sensitivity      = appSettings.sensitivity;
  const customThreshold  = appSettings.customThreshold;
  const soundEnabled     = appSettings.soundEnabled;
  const seriesEnabled    = appSettings.seriesEnabled;
  const seriesSize       = appSettings.seriesSize;
  // Resolved threshold in m/s² — presets look up from the table, custom uses the stored value.
  const thresholdValue: number =
    sensitivity === "custom"
      ? customThreshold
      : SENSITIVITY_THRESHOLDS[sensitivity];

  const {
    phase,
    tree,
    reactionTime,
    grade,
    records,
    bestTime,
    startSequence,
    reset,
    triggerLaunch,
    triggerRedLight,
    isArmed,
    isWatchingRedLight,
    getGreenAt,
    clearHistory,
    switchMode,
    setSeries,
    seriesProgress,
    seriesSummary,
    seriesBestRT,
    resetSeries,
  } = useTreeSession();

  // Keep the session's tree mode in sync with the settings store.
  // switchMode also calls reset(), so switching while idle is clean;
  // the sessionLocked guard in Settings prevents switching mid-run.
  React.useEffect(() => {
    switchMode(treeMode);
  }, [treeMode]);

  // Sync series settings into the session hook whenever they change.
  React.useEffect(() => {
    setSeries(seriesEnabled, seriesSize);
  }, [seriesEnabled, seriesSize]);

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

  // Lock Settings toggles while a run is active so the user can't change
  // modes mid-sequence and end up in a half-armed state.
  // Uses sessionLock (not settings) so this write never triggers a home
  // screen re-render — the home screen doesn't read sessionLocked.
  React.useEffect(() => {
    sessionLock.set(isActive);
    return () => { sessionLock.set(false); };
  }, [isActive]);

  // sensorActive: sensor hardware present AND enabled in settings.
  // useSimulation: tap input is active — either FLOOR IT button is on,
  // or the sensor isn't active (not available or disabled).
  const sensorActive  = isAvailable && sensorEnabled;
  const useSimulation = !sensorActive || showFloorIt;

  // ── Audio cues ────────────────────────────────────────────────────────
  // Refs track previous values so effects only fire on transitions (not on
  // every render). soundEnabled is read live inside the async functions so
  // these effects don't need it as a dependency.

  // Green beep: fires when phase becomes "go".
  const prevIsArmedRef = React.useRef(false);
  React.useEffect(() => {
    if (isArmed && !prevIsArmedRef.current) {
      void playGreenBeep();
    }
    prevIsArmedRef.current = isArmed;
  }, [isArmed]);

  // Result tone: fires on first render where isDone is true.
  const prevIsDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (isDone && !prevIsDoneRef.current && grade) {
      void playResultTone(grade);
    }
    prevIsDoneRef.current = isDone;
  }, [isDone, grade]);

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

      {/* Reaction display — replaced by series summary card on final run */}
      {seriesSummary != null
        ? <SeriesSummaryCard summary={seriesSummary} />
        : <ReactionDisplay reactionTime={reactionTime} grade={grade} />
      }

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

      {/* Series status bar — visible whenever series mode is on and summary not yet shown */}
      {seriesEnabled && seriesSummary == null && (
        <View style={[styles.seriesBar, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.seriesBarLabel, { color: colors.mutedForeground }]}>
            {seriesProgress != null ? `Run ${seriesProgress.count} / ${seriesProgress.size}` : `Ready  •  S${seriesSize}`}
          </Text>
          <Text style={[styles.seriesBarBest, { color: colors.mutedForeground }]}>
            {seriesBestRT != null ? `Best: ${seriesBestRT.toFixed(3)}s` : "Best: —"}
          </Text>
          <Pressable
            onPress={resetSeries}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Reset series"
          >
            <Text style={[styles.seriesBarReset, { color: colors.mutedForeground }]}>RESET</Text>
          </Pressable>
        </View>
      )}

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

      {/* Coaching hint — only after a repeating mistake pattern; hidden when series summary is up */}
      {isDone && seriesSummary == null && (() => {
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
        <RunHistoryChart records={records} bestTime={bestTime} />
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
    flex: 1,
  },
  badges: { flexDirection: "row", gap: 6, flexShrink: 0 },
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
  seriesBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  seriesBarLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    flex: 1,
  },
  seriesBarBest: {
    fontSize: 11,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    flex: 1,
    textAlign: "center",
  },
  seriesBarReset: {
    fontSize: 11,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
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
