// Inline panel for entering the RT from a real time slip against one run
// (PLAN.md idea 3). Opened by tapping a run in History.

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import type { RunRecord } from "@/hooks/useTreeSession";
import { slipCalibration, parseSlipInput } from "@/lib/slipCalibration";

interface Props {
  record: RunRecord;
  existing: number | null;   // slip RT already entered for this run
  onClose: () => void;
}

export function SlipEntry({ record, existing, onClose }: Props) {
  const colors = useColors();
  const [text, setText] = useState(existing !== null ? existing.toFixed(3) : "");
  const value = parseSlipInput(text);
  const invalid = text.trim() !== "" && value === null;

  const save = () => {
    if (value === null) return;
    Haptics.selectionAsync();
    slipCalibration.add(record.reactionTime, value, record.id);
    onClose();
  };

  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Time slip for the {record.reactionTime.toFixed(3)} run
        </Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={[styles.cancel, { color: colors.mutedForeground }]}>CANCEL</Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Enter the R/T printed on your slip.
      </Text>
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={save}
          placeholder="0.000"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="numeric"
          returnKeyType="done"
          autoFocus
          maxLength={7}
          style={[
            styles.input,
            { color: colors.foreground, borderColor: invalid ? colors.redOn : colors.border },
          ]}
          accessibilityLabel="Reaction time from your time slip"
        />
        <Pressable
          onPress={save}
          disabled={value === null}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary, opacity: value === null ? 0.4 : pressed ? 0.8 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save slip time"
        >
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>SAVE</Text>
        </Pressable>
      </View>
      {invalid && (
        <Text style={[styles.sub, { color: colors.redOn }]}>Use a time like 0.112 or -0.020</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  title: { fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  sub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    fontVariant: ["tabular-nums"],
  },
  btn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8 },
  btnText: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  cancel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
});
