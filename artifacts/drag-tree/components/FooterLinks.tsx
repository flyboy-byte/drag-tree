import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const PRIVACY_URL = "https://flyboy-byte.github.io/drag-tree/privacy.html";
const SOURCE_URL  = "https://github.com/flyboy-byte/drag-tree";
const VERSION     = "v1.4.0";

export function FooterLinks() {
  const colors = useColors();

  const open = (url: string) => {
    Haptics.selectionAsync();
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  return (
    <View style={styles.row}>
      <Pressable hitSlop={8} onPress={() => open(PRIVACY_URL)}>
        {({ pressed }) => (
          <Text style={[styles.link, { color: colors.mutedForeground, opacity: pressed ? 0.5 : 1 }]}>
            PRIVACY
          </Text>
        )}
      </Pressable>
      <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
      <Pressable hitSlop={8} onPress={() => open(SOURCE_URL)}>
        {({ pressed }) => (
          <Text style={[styles.link, { color: colors.mutedForeground, opacity: pressed ? 0.5 : 1 }]}>
            SOURCE
          </Text>
        )}
      </Pressable>
      <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
      <Text style={[styles.version, { color: colors.mutedForeground }]}>{VERSION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
    paddingVertical: 8,
    opacity: 0.7,
  },
  link: {
    fontSize: 10,
    fontWeight: "600" as const,
    letterSpacing: 1.5,
    fontFamily: "Inter_600SemiBold",
  },
  dot: {
    fontSize: 10,
    opacity: 0.6,
  },
  version: {
    fontSize: 10,
    fontWeight: "400" as const,
    letterSpacing: 0.5,
    fontFamily: "Inter_400Regular",
    opacity: 0.7,
  },
});
