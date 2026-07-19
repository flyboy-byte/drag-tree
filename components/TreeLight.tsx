import React from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { useColors } from "@/hooks/useColors";

export type LightColor = "amber" | "green" | "red";

interface TreeLightProps {
  color: LightColor;
  lit: boolean;
  size?: number;
}

function TreeLightImpl({ color, lit, size = 52 }: TreeLightProps) {
  const colors = useColors();
  const scale = React.useRef(new Animated.Value(1)).current;
  const glowOpacity = React.useRef(new Animated.Value(lit ? 1 : 0)).current;
  const brightness = React.useRef(new Animated.Value(lit ? 1 : 0.18)).current;

  React.useEffect(() => {
    if (lit) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.07, damping: 8, stiffness: 220, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, damping: 14, stiffness: 220, useNativeDriver: true }),
      ]).start();
      Animated.timing(brightness, {
        toValue: 1,
        duration: 55,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }).start();
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 55,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(brightness, {
        toValue: 0.18,
        duration: 220,
        easing: Easing.in(Easing.exp),
        useNativeDriver: true,
      }).start();
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      Animated.timing(scale, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [lit]);

  const getColors = () => {
    switch (color) {
      case "amber": return { on: colors.amberOn, glow: colors.amberGlow };
      case "green": return { on: colors.greenOn, glow: colors.greenGlow };
      case "red":   return { on: colors.redOn,   glow: colors.redGlow };
    }
  };
  const { on, glow } = getColors();

  const outerGlowOpacity = glowOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.65],
  });

  const coreOpacity = brightness.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  const bezelSize = size + 10;
  const glowSize = size + 28;

  return (
    <View style={[styles.wrapper, { width: glowSize, height: glowSize }]}>
      <Animated.View
        style={[
          styles.glow,
          { width: glowSize, height: glowSize, borderRadius: glowSize / 2, backgroundColor: glow },
          { opacity: outerGlowOpacity },
        ]}
      />
      <View
        style={[
          styles.bezel,
          { width: bezelSize, height: bezelSize, borderRadius: bezelSize / 2 },
        ]}
      >
        <View
          style={[
            styles.innerRing,
            { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
          ]}
        >
          <Animated.View
            style={[
              styles.bulb,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: on,
                shadowColor: on,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: lit ? 0.95 : 0,
                shadowRadius: 18,
                elevation: lit ? 16 : 0,
              },
              { transform: [{ scale }], opacity: brightness },
            ]}
          >
            <Animated.View style={[styles.specular, { opacity: coreOpacity }]}>
              <View style={[styles.highlight, { width: size * 0.32, height: size * 0.32 }]} />
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

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
