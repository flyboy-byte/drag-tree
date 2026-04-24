import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

type LightColor = "amber" | "green" | "red";

interface TreeLightProps {
  color: LightColor;
  lit: boolean;
  size?: number;
}

export function TreeLight({ color, lit, size = 54 }: TreeLightProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(lit ? 1 : 0.12);

  React.useEffect(() => {
    if (lit) {
      scale.value = withSpring(1.08, { damping: 8, stiffness: 200 }, () => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
      opacity.value = withTiming(1, { duration: 60, easing: Easing.out(Easing.exp) });
    } else {
      opacity.value = withTiming(0.12, { duration: 200, easing: Easing.in(Easing.exp) });
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [lit]);

  const getColors = () => {
    switch (color) {
      case "amber":
        return { on: colors.amberOn, off: colors.amberOff, glow: colors.amberGlow };
      case "green":
        return { on: colors.greenOn, off: colors.greenOff, glow: colors.greenGlow };
      case "red":
        return { on: colors.redOn, off: colors.redOff, glow: colors.redGlow };
    }
  };

  const { on, off, glow } = getColors();

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: lit ? opacity.value * 0.7 : 0,
  }));

  return (
    <View style={[styles.wrapper, { width: size + 20, height: size + 20 }]}>
      <Animated.View
        style={[
          styles.glow,
          { width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, backgroundColor: glow },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.light,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: lit ? on : off,
            shadowColor: on,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: lit ? 0.9 : 0,
            shadowRadius: 16,
            elevation: lit ? 12 : 0,
          },
          animStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
  },
  light: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
  },
});
