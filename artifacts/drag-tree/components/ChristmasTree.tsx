import React from "react";
import { View, StyleSheet } from "react-native";
import { TreeLight } from "./TreeLight";

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
  lightSize?: number;
}

export function ChristmasTree({ state, lightSize = 54 }: ChristmasTreeProps) {
  return (
    <View style={styles.tree}>
      <View style={styles.column}>
        <TreeLight color="amber" lit={state.preStage} size={lightSize * 0.7} />
        <TreeLight color="amber" lit={state.stage} size={lightSize * 0.7} />
        <View style={styles.spacer} />
        <TreeLight color="amber" lit={state.amber1} size={lightSize} />
        <TreeLight color="amber" lit={state.amber2} size={lightSize} />
        <TreeLight color="amber" lit={state.amber3} size={lightSize} />
        <TreeLight color="green" lit={state.green} size={lightSize} />
        <TreeLight color="red" lit={state.red} size={lightSize} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tree: {
    alignItems: "center",
    justifyContent: "center",
  },
  column: {
    alignItems: "center",
    gap: 6,
  },
  spacer: {
    height: 10,
  },
});
