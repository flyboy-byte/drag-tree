import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { RunRecord } from "@/hooks/useTreeSession";

interface RunHistoryChartProps {
  records: RunRecord[];
  bestTime: number | null;
}

const CHART_HEIGHT = 60;
const MIN_RT = 0.05;
const MAX_RT = 1.0;
const REDLIGHT_STUB = 8;
const MIN_CLEAN_HEIGHT = 4;

function cleanBarHeight(rt: number): number {
  const normalized = 1 - Math.min(1, Math.max(0, (rt - MIN_RT) / (MAX_RT - MIN_RT)));
  return Math.max(MIN_CLEAN_HEIGHT, normalized * CHART_HEIGHT);
}

export function RunHistoryChart({ records, bestTime }: RunHistoryChartProps) {
  const colors = useColors();

  if (records.length < 2) return null;

  // Show up to last 30, oldest first (left → right)
  const visible = records.slice(0, 30).reverse();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>TREND</Text>
      <View style={[styles.chartArea, { borderColor: colors.border }]}>
        {/* Baseline */}
        <View style={[styles.baseline, { backgroundColor: colors.border }]} />

        {/* Bars */}
        <View style={styles.barsRow}>
          {visible.map((run) => {
            const isRedLight = run.grade === "redlight";
            const isPB = !isRedLight && bestTime !== null && run.reactionTime === bestTime;

            if (isRedLight) {
              return (
                <View key={run.id} style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: REDLIGHT_STUB,
                        backgroundColor: colors.redOn,
                        opacity: 0.7,
                      },
                    ]}
                  />
                </View>
              );
            }

            const h = cleanBarHeight(run.reactionTime);
            const barColor = isPB
              ? colors.primary
              : run.grade === "perfect" || run.grade === "pro"
              ? colors.greenOn
              : run.grade === "great" || run.grade === "good"
              ? colors.foreground
              : colors.mutedForeground;

            return (
              <View key={run.id} style={styles.barSlot}>
                {isPB && (
                  <View
                    style={[styles.pbDot, { backgroundColor: colors.primary }]}
                  />
                )}
                <View
                  style={[
                    styles.bar,
                    {
                      height: h,
                      backgroundColor: barColor,
                      opacity: isPB ? 1 : 0.75,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>PB</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.redOn, opacity: 0.7 }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Red light</Text>
        </View>
        <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
          {bestTime !== null ? `best ${bestTime.toFixed(3)}s` : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  chartArea: {
    height: CHART_HEIGHT + 4,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
    paddingHorizontal: 6,
    paddingBottom: 2,
    position: "relative",
  },
  baseline: {
    position: "absolute",
    bottom: 2,
    left: 0,
    right: 0,
    height: 1,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flex: 1,
    gap: 2,
  },
  barSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 2,
    minWidth: 2,
  },
  pbDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 2,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 5,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
});
