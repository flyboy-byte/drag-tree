// Settings card summarising time-slip calibration (PLAN.md idea 3).

import React, { useSyncExternalStore } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { slipCalibration, averageOffset } from "@/lib/slipCalibration";

export function TimeSlipCard() {
  const colors = useColors();
  const pairs = useSyncExternalStore(slipCalibration.subscribe, slipCalibration.get, slipCalibration.get);
  const offset = averageOffset(pairs);

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>TIME SLIP</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Tap a run in History to add the R/T from your time slip. The track starts timing at the
        stage beam, the app at the car's first movement, so the two differ a little for every car.
      </Text>
      {offset !== null ? (
        <>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Average difference ({pairs.length} {pairs.length === 1 ? "slip" : "slips"})
            </Text>
            <Text style={[styles.val, { color: colors.foreground }]}>
              {offset >= 0 ? "+" : "−"}{Math.abs(offset).toFixed(3)} s
            </Text>
          </View>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {Math.abs(offset) < 0.0005
              ? "Your slips match the app."
              : `Your slips read ${offset > 0 ? "slower" : "faster"} than the app.`}
            {pairs.length >= 2 ? " Results show a slip estimate." : " Add one more to see slip estimates on results."}
          </Text>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); slipCalibration.clear(); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear time slip data"
          >
            <Text style={[styles.clear, { color: colors.mutedForeground }]}>CLEAR SLIPS</Text>
          </Pressable>
        </>
      ) : (
        <Text style={[styles.val, { color: colors.mutedForeground }]}>No slips yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  cardLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  label: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 1 },
  val: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  clear: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginTop: 4 },
});
