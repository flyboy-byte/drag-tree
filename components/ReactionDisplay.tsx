import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

export type ReactionGrade =
  | "perfect"
  | "pro"
  | "great"
  | "good"
  | "late"
  | "redlight"
  | null;

interface ReactionDisplayProps {
  reactionTime: number | null;
  grade: ReactionGrade;
}

function getGradeInfo(grade: ReactionGrade, rt: number | null) {
  if (!grade || rt === null) return null;
  switch (grade) {
    case "perfect":
      return { label: "PERFECT", color: "#ffd700", desc: "Lights out" };
    case "pro":
      return { label: "PRO", color: "#22c55e", desc: "Pro reaction" };
    case "great":
      return { label: "GREAT", color: "#4ade80", desc: "Race ready" };
    case "good":
      return { label: "GOOD", color: "#a3e635", desc: "On pace" };
    case "late":
      return { label: "LATE", color: "#f97316", desc: "Left late" };
    case "redlight":
      return { label: "RED LIGHT", color: "#ef4444", desc: "Too early!" };
  }
}

export function ReactionDisplay({ reactionTime, grade }: ReactionDisplayProps) {
  const colors = useColors();
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (reactionTime !== null && grade) {
      scale.value = withSpring(1, { damping: 10, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value = 0.7;
      opacity.value = 0;
    }
  }, [reactionTime, grade]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const info = getGradeInfo(grade, reactionTime);

  if (!info || reactionTime === null) {
    return <View style={styles.placeholder} />;
  }

  const rtDisplay =
    grade === "redlight"
      ? "RED LIGHT"
      : `${reactionTime >= 0 ? "" : "-"}${Math.abs(reactionTime).toFixed(3)}s`;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <Text style={[styles.grade, { color: info.color }]}>{info.label}</Text>
      <Text style={[styles.time, { color: colors.foreground }]}>{rtDisplay}</Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>{info.desc}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 110,
  },
  container: {
    alignItems: "center",
    height: 110,
    justifyContent: "center",
    gap: 2,
  },
  grade: {
    fontSize: 15,
    fontWeight: "700" as const,
    letterSpacing: 3,
    fontFamily: "Inter_700Bold",
  },
  time: {
    fontSize: 52,
    fontWeight: "700" as const,
    letterSpacing: -1,
    fontFamily: "Inter_700Bold",
    lineHeight: 56,
  },
  desc: {
    fontSize: 13,
    fontWeight: "500" as const,
    letterSpacing: 1,
    fontFamily: "Inter_500Medium",
  },
});
