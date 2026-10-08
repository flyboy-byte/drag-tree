// Two-player head-to-head screen (PLAN.md idea 6).
// SCAFFOLD: layout only — two lanes, the top one rotated to face the far
// player. Not linked from the app yet. Grading lives in lib/versus.ts.
//
// To build out:
//   - shared tree (or one per lane) driven by a two-lane session state
//   - each lane's Pressable records its own tap time → decideWinner()
//   - results go to a VersusTally, never into solo history/best

import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import type { Player } from "@/lib/versus";

export default function VersusScreen() {
  const colors = useColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Lane player="top" />
      <View style={[styles.middle, { borderColor: colors.border }]}>
        <Text style={[styles.middleText, { color: colors.mutedForeground }]}>
          Head-to-head — in progress
        </Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={[styles.middleText, { color: colors.primary }]}>Back</Text>
        </Pressable>
      </View>
      <Lane player="bottom" />
    </SafeAreaView>
  );
}

function Lane({ player }: { player: Player }) {
  const colors = useColors();
  return (
    <View
      style={[styles.lane, player === "top" && styles.flipped]}
      accessibilityLabel={player === "top" ? "Player 2 lane" : "Player 1 lane"}
    >
      <Text style={[styles.laneLabel, { color: colors.foreground }]}>
        {player === "top" ? "PLAYER 2" : "PLAYER 1"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lane: { flex: 1, alignItems: "center", justifyContent: "center" },
  flipped: { transform: [{ rotate: "180deg" }] },
  laneLabel: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: 2 },
  middle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  middleText: { fontFamily: "Inter_500Medium", fontSize: 13 },
});
