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

export type LightColor = "amber" | "green" | "red";

interface TreeLightProps {
  color: LightColor;
  lit: boolean;
  size?: number;
}

function TreeLightImpl({ color, lit, size = 52 }: TreeLightProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(lit ? 1 : 0);
  const brightness = useSharedValue(lit ? 1 : 0.18);

  React.useEffect(() => {
    if (lit) {
      scale.value = withSpring(1.07, { damping: 8, stiffness: 220 }, () => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      });
      brightness.value = withTiming(1, { duration: 55, easing: Easing.out(Easing.exp) });
      glowOpacity.value = withTiming(1, { duration: 55 });
    } else {
      brightness.value = withTiming(0.18, { duration: 220, easing: Easing.in(Easing.exp) });
      glowOpacity.value = withTiming(0, { duration: 220 });
      scale.value = withTiming(1, { duration: 220 });
    }
  }, [lit]);

  const getColors = () => {
    switch (color) {
      case "amber": return { on: colors.amberOn, off: colors.amberOff, glow: colors.amberGlow };
      case "green": return { on: colors.greenOn, off: colors.greenOff, glow: colors.greenGlow };
      case "red":   return { on: colors.redOn,   off: colors.redOff,   glow: colors.redGlow };
    }
  };
  const { on, off, glow } = getColors();

  const outerGlow = useAnimatedStyle(() => ({
    opacity: glowOpacity.value * 0.65,
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: brightness.value,
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (brightness.value - 0.5) * 2),
  }));

  const bezelSize = size + 10;
  const glowSize = size + 28;

  return (
    <View style={[styles.wrapper, { width: glowSize, height: glowSize }]}>
      {/* Outer glow bloom */}
      <Animated.View
        style={[
          styles.glow,
          { width: glowSize, height: glowSize, borderRadius: glowSize / 2, backgroundColor: glow },
          outerGlow,
        ]}
      />
      {/* Chrome bezel ring */}
      <View
        style={[
          styles.bezel,
          {
            width: bezelSize,
            height: bezelSize,
            borderRadius: bezelSize / 2,
          },
        ]}
      >
        {/* Inner shadow ring */}
        <View
          style={[
            styles.innerRing,
            { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
          ]}
        >
          {/* The bulb */}
          <Animated.View
            style={[
              styles.bulb,
              { width: size, height: size, borderRadius: size / 2,
                backgroundColor: on,
                shadowColor: on, shadowOffset: { width: 0, height: 0 },
                shadowOpacity: lit ? 0.95 : 0, shadowRadius: 18, elevation: lit ? 16 : 0,
              },
              innerStyle,
            ]}
          >
            {/* Specular highlight */}
            <Animated.View style={[styles.specular, coreStyle]}>
              <View style={[styles.highlight, { width: size * 0.32, height: size * 0.32 }]} />
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

// Memoized: only re-renders when its own color/lit/size actually change,
// so flipping amber1 doesn't re-render the green or red bulbs.
export const TreeLight = React.memo(TreeLightImpl);

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
  },
  bezel: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3a3a3a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 6,
    // Chrome gradient effect via border
    borderWidth: 2,
    borderTopColor: "#666",
    borderLeftColor: "#555",
    borderRightColor: "#222",
    borderBottomColor: "#1a1a1a",
  },
  innerRing: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#000",
  },
  bulb: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
    overflow: "hidden",
  },
  specular: {
    alignItems: "center",
  },
  highlight: {
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
