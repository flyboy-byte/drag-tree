// Two-player head-to-head (PLAN.md idea 6).
// Phone lies flat between two players; the top lane is rotated to face the
// far player. Each lane is one big tap zone. Lanes use raw touch events
// (pointer events on web) instead of Pressable so two simultaneous touches
// both register — Pressable's responder only tracks one touch at a time.

import { router } from "expo-router";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { TreeLight } from "@/components/TreeLight";
import type { TreeState } from "@/components/ChristmasTree";
import { useColors } from "@/hooks/useColors";
import { useVersusSession } from "@/hooks/useVersusSession";
import { settings } from "@/lib/settings";
import { playGreenBeep } from "@/lib/audio";
import type { Player, VersusPhase, VersusResult, VersusTally } from "@/lib/versus";

const LABEL: Record<Player, string> = { bottom: "PLAYER 1", top: "PLAYER 2" };

export default function VersusScreen() {
  const colors = useColors();
  const { treeMode } = useSyncExternalStore(settings.subscribe, settings.get, settings.get);
  const { phase, tree, lanes, result, tally, start, tap, resetTally } = useVersusSession(treeMode);

  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === "go" && prevPhase.current !== "go") void playGreenBeep();
    if (phase === "done" && prevPhase.current !== "done") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevPhase.current = phase;
  }, [phase]);

  const onLaneTouch = (player: Player) => {
    const rt = tap(player, performance.now());
    if (rt === null) return;
    Haptics.impactAsync(rt < 0 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium);
  };

  const racing = phase === "staging" || phase === "countdown" || phase === "go";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Lane player="top" phase={phase} tree={tree} rt={lanes.top} result={result} tally={tally} onTouch={onLaneTouch} />

      <View style={[styles.middle, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable
          onPress={() => router.back()}
          disabled={racing}
          hitSlop={12}
          style={{ opacity: racing ? 0.3 : 1 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); start(); }}
          disabled={racing}
          style={({ pressed }) => [
            styles.startBtn,
            { backgroundColor: racing ? "transparent" : colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={phase === "done" ? "Race again" : "Start race"}
        >
          <Text style={[styles.startText, { color: racing ? colors.mutedForeground : colors.primaryForeground }]} maxFontSizeMultiplier={1.3}>
            {racing ? "RACING" : phase === "done" ? "AGAIN" : "START"}
          </Text>
        </Pressable>

        <Pressable
          onLongPress={resetTally}
          disabled={racing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Score ${tally.bottom} to ${tally.top}. Long press to reset.`}
        >
          <Text style={[styles.score, { color: colors.foreground }]}>
            {tally.bottom}–{tally.top}
          </Text>
        </Pressable>
      </View>

      <Lane player="bottom" phase={phase} tree={tree} rt={lanes.bottom} result={result} tally={tally} onTouch={onLaneTouch} />
    </SafeAreaView>
  );
}

function Lane({
  player, phase, tree, rt, result, tally, onTouch,
}: {
  player: Player;
  phase: VersusPhase;
  tree: TreeState;
  rt: number | null;
  result: VersusResult | null;
  tally: VersusTally;
  onTouch: (p: Player) => void;
}) {
  const colors = useColors();
  const red = rt !== null && rt < 0;
  // TreeLight's glow ring makes each light ~1.75× its size wide; fit 5 in a
  // row next to the stage dots on any phone width.
  const { width } = useWindowDimensions();
  const lightSize = Math.max(22, Math.min(36, Math.floor((width - 86) / 9)));

  const touchProps = Platform.OS === "web"
    ? { onPointerDown: () => onTouch(player) }
    : { onTouchStart: () => onTouch(player) };

  let big = "";
  let bigColor: string = colors.foreground;
  let small = "";
  if (phase === "idle") {
    small = "Tap your side when the green lights";
  } else if (phase === "done" && result) {
    const w = result.winner;
    big = w === "tie" ? "TIE" : w === "none" ? "NO GO" : w === player ? "WIN" : "LOSE";
    bigColor = w === player ? colors.greenOn : w === "tie" || w === "none" ? colors.foreground : colors.redOn;
    small = rt === null ? "didn't go" : red ? (rt > -1 ? `RED LIGHT  ${rt.toFixed(3)}` : "RED LIGHT") : `${rt.toFixed(3)} s`;
  } else if (rt !== null) {
    big = red ? "RED LIGHT" : rt.toFixed(3);
    bigColor = red ? colors.redOn : colors.foreground;
  }

  return (
    <View
      style={[styles.lane, player === "top" && styles.flipped]}
      {...touchProps}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${LABEL[player]} lane`}
    >
      <View style={styles.laneHeader}>
        <Text style={[styles.laneLabel, { color: colors.mutedForeground }]}>{LABEL[player]}</Text>
        <Text style={[styles.laneLabel, { color: colors.mutedForeground }]}>WINS {tally[player]}</Text>
      </View>

      <View style={styles.lights} pointerEvents="none">
        <View style={styles.stageCol}>
          <Dot lit={tree.preStage} />
          <Dot lit={tree.stage} />
        </View>
        <TreeLight color="amber" lit={tree.amber1} size={lightSize} />
        <TreeLight color="amber" lit={tree.amber2} size={lightSize} />
        <TreeLight color="amber" lit={tree.amber3} size={lightSize} />
        <TreeLight color="green" lit={tree.green} size={lightSize} />
        <TreeLight color="red" lit={red} size={lightSize} />
      </View>

      <View style={styles.resultArea} pointerEvents="none">
        {big !== "" && <Text style={[styles.big, { color: bigColor }]} maxFontSizeMultiplier={1.15} numberOfLines={1} adjustsFontSizeToFit>{big}</Text>}
        {small !== "" && <Text style={[styles.small, { color: colors.mutedForeground }]}>{small}</Text>}
      </View>
    </View>
  );
}

function Dot({ lit }: { lit: boolean }) {
  const colors = useColors();
  return <View style={[styles.dot, { backgroundColor: lit ? colors.amberOn : colors.amberOff }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lane: { flex: 1, paddingHorizontal: 20, paddingVertical: 14, justifyContent: "space-between" },
  flipped: { transform: [{ rotate: "180deg" }] },
  laneHeader: { flexDirection: "row", justifyContent: "space-between" },
  laneLabel: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2 },
  lights: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  stageCol: { gap: 6, marginRight: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  resultArea: { alignItems: "center", minHeight: 84, justifyContent: "center", gap: 2 },
  big: { fontFamily: "Inter_700Bold", fontSize: 44, letterSpacing: 1, fontVariant: ["tabular-nums"] },
  small: { fontFamily: "Inter_500Medium", fontSize: 13, letterSpacing: 0.5, textAlign: "center" },
  middle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  startBtn: { paddingVertical: 10, paddingHorizontal: 36, borderRadius: 12 },
  startText: { fontFamily: "Inter_700Bold", fontSize: 15, letterSpacing: 3 },
  score: { fontFamily: "Inter_700Bold", fontSize: 18, fontVariant: ["tabular-nums"], minWidth: 40, textAlign: "right" },
});
