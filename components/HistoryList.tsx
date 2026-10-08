import React from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { RunRecord } from "@/hooks/useTreeSession";
import { computeConsistency, DEFAULT_WINDOW } from "@/lib/consistency";

interface HistoryListProps {
  records: RunRecord[];
  onClear: () => void;
  // Tapping a run opens time-slip entry for it. Timeouts aren't selectable.
  onSelect?: (record: RunRecord) => void;
  selectedId?: string | null;
  slipIds?: Set<string>;   // runs that already have a slip entered
}

function gradeColor(grade: string | null): string {
  switch (grade) {
    case "perfect": return "#ffd700";
    case "pro": return "#22c55e";
    case "great": return "#4ade80";
    case "good": return "#a3e635";
    case "late": return "#f97316";
    case "redlight": return "#ef4444";
    default: return "#666";
  }
}

export function HistoryList({ records, onClear, onSelect, selectedId, slipIds }: HistoryListProps) {
  const colors = useColors();

  if (records.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No runs yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.mutedForeground }]}>
          HISTORY ({records.length})
        </Text>
        <Pressable onPress={onClear} hitSlop={12}>
          <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <ConsistencyStrip records={records} />
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        scrollEnabled={records.length > 3}
        renderItem={({ item }) => {
          const selectable = !!onSelect && item.reactionTime < 2;
          const selected = item.id === selectedId;
          return (
          <Pressable
            onPress={selectable ? () => onSelect!(item) : undefined}
            disabled={!selectable}
            style={[
              styles.record,
              { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
            ]}
            accessibilityRole={selectable ? "button" : undefined}
            accessibilityLabel={
              item.grade === "redlight"
                ? "Red light"
                : `${item.reactionTime.toFixed(3)} seconds${slipIds?.has(item.id) ? ", slip entered" : ""}`
            }
            accessibilityHint={selectable ? "Add the reaction time from your time slip" : undefined}
          >
            <Text style={[styles.recordGrade, { color: gradeColor(item.grade) }]}>
              {item.grade === "redlight" ? "RL" : (item.grade ?? "—").toUpperCase().slice(0, 3)}
            </Text>
            <Text style={[styles.recordTime, { color: colors.foreground }]}>
              {item.grade === "redlight"
                ? "—"
                : `${item.reactionTime.toFixed(3)}`}
            </Text>
            <Text style={[styles.recordMode, { color: colors.mutedForeground }]}>
              {item.mode === "pro" ? "PRO" : "FULL"}{slipIds?.has(item.id) ? " · SLIP" : ""}
            </Text>
          </Pressable>
          );
        }}
      />
    </View>
  );
}

// One line of consistency stats over the visible history. Hidden until there
// are 3 clean runs — fewer than that and the numbers don't mean much.
function ConsistencyStrip({ records }: { records: RunRecord[] }) {
  const colors = useColors();
  const s = computeConsistency(records);
  if (s.cleanCount < 3 || s.meanRT === null || s.stdDev === null || s.withinPct === null) return null;

  const items: [string, string][] = [
    ["AVG", s.meanRT.toFixed(3)],
    ["SPREAD", `±${s.stdDev.toFixed(3)}`],
    [`±${DEFAULT_WINDOW.toFixed(3).slice(1)}`, `${Math.round(s.withinPct)}%`],
    ["STREAK", String(s.streak)],
  ];

  return (
    <View
      style={styles.stats}
      accessible
      accessibilityLabel={
        `Average ${s.meanRT.toFixed(3)} seconds, spread plus or minus ${s.stdDev.toFixed(3)}, ` +
        `${Math.round(s.withinPct)} percent within ${DEFAULT_WINDOW.toFixed(3)}, streak ${s.streak}`
      }
    >
      {items.map(([label, value]) => (
        <View key={label} style={styles.stat}>
          <Text style={[styles.statVal, { color: colors.foreground }]}>{value}</Text>
          <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  stat: { alignItems: "center" },
  statVal: {
    fontSize: 14,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
  },
  statLab: {
    fontSize: 9,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginTop: 1,
  },
  container: {
    width: "100%",
  },
  empty: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  record: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 72,
  },
  recordGrade: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },
  recordTime: {
    fontSize: 18,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  recordMode: {
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
