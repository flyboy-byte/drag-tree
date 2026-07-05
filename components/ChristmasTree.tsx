import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TreeLight } from "./TreeLight";
import { useColors } from "@/hooks/useColors";

export interface TreeState {
  preStage: boolean;
  stage: boolean;
  amber1: boolean;
  amber2: boolean;
  amber3: boolean;
  green: boolean;
  red: boolean;
}

interface ChristmasTreeProps {
  state: TreeState;
}

function LightRow({
  color,
  lit,
  size,
}: {
  color: "amber" | "green" | "red";
  lit: boolean;
  size: number;
}) {
  return (
    <View style={rowStyles.row}>
      <TreeLight color={color} lit={lit} size={size} />
      <View style={rowStyles.gap} />
      <TreeLight color={color} lit={lit} size={size} />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  gap: {
    width: 6,
  },
});

function StagingRow({ label, lit }: { label: string; lit: boolean }) {
  const colors = useColors();
  const dotSize = 20;
  const dotColor = lit ? colors.amberOn : colors.amberOff;
  const dotGlow = lit ? colors.amberGlow : "transparent";

  return (
    <View style={stagingStyles.row}>
      <View
        style={[
          stagingStyles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: dotColor,
            shadowColor: colors.amberOn,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: lit ? 0.9 : 0,
            shadowRadius: 8,
            elevation: lit ? 8 : 0,
          },
        ]}
      />
      <Text style={[stagingStyles.label, { color: "#e8e8e8" }]}>{label}</Text>
      <View
        style={[
          stagingStyles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: dotColor,
            shadowColor: colors.amberOn,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: lit ? 0.9 : 0,
            shadowRadius: 8,
            elevation: lit ? 8 : 0,
          },
        ]}
      />
    </View>
  );
}

const stagingStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "800" as const,
    letterSpacing: 2.5,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    minWidth: 130,
  },
  dot: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
});

export function ChristmasTree({ state }: ChristmasTreeProps) {
  const colors = useColors();
  const LARGE = 48;

  return (
    <View style={[styles.housing, { backgroundColor: "#0d0d0d", borderColor: "#2a2a2a" }]}>
      {/* Top staging section */}
      <View style={[styles.stagingSection, { borderBottomColor: "#2a2a2a" }]}>
        <StagingRow label="PRE-STAGE" lit={state.preStage} />
        <StagingRow label="STAGE" lit={state.stage} />
      </View>

      {/* Countdown ambers + green + red */}
      <View style={styles.lightsSection}>
        {/* Center divider stripe */}
        <View style={[styles.centerStripe, { backgroundColor: "#1a3a5c" }]} />

        <View style={styles.lightRows}>
          <LightRow color="amber" lit={state.amber1} size={LARGE} />
          <LightRow color="amber" lit={state.amber2} size={LARGE} />
          <LightRow color="amber" lit={state.amber3} size={LARGE} />
          <View style={[styles.dividerLine, { backgroundColor: "#222" }]} />
          <LightRow color="green" lit={state.green} size={LARGE} />
          <LightRow color="red" lit={state.red} size={LARGE} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  housing: {
    borderRadius: 8,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 14,
  },
  stagingSection: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    gap: 6,
  },
  lightsSection: {
    position: "relative",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  centerStripe: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 10,
    left: "50%",
    marginLeft: -5,
  },
  lightRows: {
    alignItems: "center",
    gap: 2,
    zIndex: 1,
  },
  dividerLine: {
    width: "80%",
    height: 1,
    marginVertical: 4,
  },
});
