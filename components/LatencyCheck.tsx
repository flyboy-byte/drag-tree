// Phone latency card for the Settings screen (PLAN.md idea 2).
// Two checks:
//   1. Timing check (2 s): screen refresh rate from requestAnimationFrame and
//      sensor sample rate from DeviceMotion — together they bound how
//      precisely green and launch onset can be timed.
//   2. Tap test: tap along with a steady flash; the mean offset is touch
//      latency plus the person, so it's shown as an estimate.

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { DeviceMotion } from "expo-sensors";
import { useColors } from "@/hooks/useColors";
import { rateStats, pairTaps, tapOffsetMs, type RateStats } from "@/lib/latency";

const CHECK_MS = 2000;
const SAMPLE_INTERVAL_MS = 8;
const BEAT_MS = 600;
const BEATS = 12;
const WARMUP = 4;

interface CheckResult {
  frame: RateStats | null;
  sensor: RateStats | null;
}

export function LatencyCheck({ disabled }: { disabled?: boolean }) {
  const colors = useColors();
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);

  const [tapState, setTapState] = useState<"idle" | "running" | "done">("idle");
  const [flashOn, setFlashOn] = useState(false);
  const [beat, setBeat] = useState(0);
  const [tapResult, setTapResult] = useState<{ offset: number | null; n: number } | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);
  const flashesRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const runCheck = async () => {
    if (checking || disabled) return;
    setChecking(true);
    setCheck(null);

    const frames: number[] = [];
    const samples: number[] = [];
    let raf = 0;
    const loop = (t: number) => { frames.push(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    let sub: { remove: () => void } | null = null;
    const sensorOk = Platform.OS !== "web" && await DeviceMotion.isAvailableAsync().catch(() => false);
    if (sensorOk) {
      DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
      sub = DeviceMotion.addListener(() => { samples.push(performance.now()); });
    }

    const timer = setTimeout(() => {
      cancelAnimationFrame(raf);
      sub?.remove();
      cleanupRef.current = null;
      setCheck({ frame: rateStats(frames), sensor: sensorOk ? rateStats(samples) : null });
      setChecking(false);
    }, CHECK_MS);

    cleanupRef.current = () => { clearTimeout(timer); cancelAnimationFrame(raf); sub?.remove(); };
  };

  const runTapTest = () => {
    if (tapState === "running" || disabled) return;
    flashesRef.current = [];
    tapsRef.current = [];
    setTapResult(null);
    setBeat(0);
    setTapState("running");

    let n = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const flash = () => {
      n += 1;
      setBeat(n);
      setFlashOn(true);
      // Flash time = the frame it's painted on, same as green in a run.
      requestAnimationFrame(t => { flashesRef.current.push(t); });
      timers.push(setTimeout(() => setFlashOn(false), 120));
      if (n < BEATS) {
        timers.push(setTimeout(flash, BEAT_MS));
      } else {
        timers.push(setTimeout(() => {
          const pairs = pairTaps(flashesRef.current, tapsRef.current, BEAT_MS, WARMUP);
          setTapResult({ offset: tapOffsetMs(pairs), n: pairs.length });
          setTapState("done");
          cleanupRef.current = null;
        }, BEAT_MS));
      }
    };
    timers.push(setTimeout(flash, 400));
    cleanupRef.current = () => timers.forEach(clearTimeout);
  };

  const onTap = () => {
    if (tapState !== "running") return;
    tapsRef.current.push(performance.now());
    Haptics.selectionAsync();
  };

  const busy = checking || tapState === "running";

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>PHONE LATENCY</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        How precisely this phone can time a run.
      </Text>

      {check && (
        <View style={{ gap: 4 }}>
          <Row
            label="Screen"
            value={check.frame ? `${Math.round(check.frame.hz)} Hz` : "—"}
            sub={check.frame ? `green can appear up to ${check.frame.meanIntervalMs.toFixed(1)} ms after it's timed` : undefined}
          />
          <Row
            label="Motion sensor"
            value={check.sensor ? `${Math.round(check.sensor.hz)} Hz` : "not available"}
            sub={check.sensor
              ? `launch timed to within ${check.sensor.meanIntervalMs.toFixed(1)} ms · jitter ${check.sensor.jitterMs.toFixed(1)} ms`
              : undefined}
          />
        </View>
      )}

      <Pressable
        onPress={runCheck}
        disabled={busy || disabled}
        style={({ pressed }) => [styles.btn, { borderColor: colors.border, opacity: pressed ? 0.7 : busy || disabled ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Run timing check"
      >
        <Text style={[styles.btnText, { color: colors.foreground }]}>
          {checking ? "CHECKING…" : check ? "CHECK AGAIN" : "RUN TIMING CHECK"}
        </Text>
      </Pressable>

      <View style={[styles.divider, { borderColor: colors.border }]} />

      <Text style={[styles.rowVal, { color: colors.foreground }]}>Tap test</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Tap the pad in time with the flash. Shows how far your taps land from it — touch delay plus you.
      </Text>

      {tapState === "running" ? (
        <Pressable
          onPressIn={onTap}
          // react-native-web ignores a Pressable with only onPressIn.
          onPress={() => {}}
          style={[
            styles.pad,
            { borderColor: colors.border, backgroundColor: flashOn ? colors.primary : colors.card },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Tap pad"
        >
          <Text style={[styles.padText, { color: flashOn ? colors.primaryForeground : colors.mutedForeground }]}>
            {beat <= WARMUP ? "FIND THE BEAT" : "TAP"} · {beat}/{BEATS}
          </Text>
        </Pressable>
      ) : (
        <>
          {tapResult && (
            <Row
              label="Tap offset (estimate)"
              value={tapResult.offset === null ? "no taps on beat" : `${tapResult.offset >= 0 ? "+" : ""}${Math.round(tapResult.offset)} ms`}
              sub={tapResult.offset === null ? undefined : `${tapResult.n} taps · + means after the flash`}
            />
          )}
          <Pressable
            onPress={runTapTest}
            disabled={busy || disabled}
            style={({ pressed }) => [styles.btn, { borderColor: colors.border, opacity: pressed ? 0.7 : busy || disabled ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Start tap test"
          >
            <Text style={[styles.btnText, { color: colors.foreground }]}>
              {tapState === "done" ? "TAP TEST AGAIN" : "START TAP TEST"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
        <Text style={[styles.rowVal, { color: colors.foreground }]}>{value}</Text>
        {sub && <Text style={[styles.sub, { color: colors.mutedForeground, textAlign: "right" }]}>{sub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  cardLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, gap: 12 },
  rowLabel: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0 },
  rowVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  btn: { paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center", marginTop: 2 },
  btnText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 6 },
  pad: { height: 120, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  padText: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 2 },
});
