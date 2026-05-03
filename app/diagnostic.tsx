import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DeviceMotion } from "expo-sensors";
import { useColors } from "@/hooks/useColors";
import { SENSITIVITY_THRESHOLDS } from "@/hooks/useAccelerometer";

const SAMPLE_INTERVAL_MS = 8;
const CAPTURE_DURATION_MS = 5000;

interface Sample {
  t: number;
  mag: number;
}

function tsToMs(raw: number): number {
  if (raw > 1e12) return raw / 1e6;
  if (raw > 1e9)  return raw;
  if (raw > 1e6)  return raw;
  return raw * 1000;
}

function magnitude3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

interface CaptureResult {
  totalSamples: number;
  durationMs: number;
  meanIntervalMs: number;
  jitterMs: number;     // std-dev of intervals
  peakG: number;
  peakMag: number;
  // Onset analysis (only if peak exceeded any threshold)
  onsetTimes: { gentle: number | null; normal: number | null; hard: number | null };
  thresholdTimes: { gentle: number | null; normal: number | null; hard: number | null };
  rewindMs: { gentle: number | null; normal: number | null; hard: number | null };
}

function analyzeCapture(samples: Sample[]): CaptureResult {
  if (samples.length === 0) {
    return {
      totalSamples: 0,
      durationMs: 0,
      meanIntervalMs: 0,
      jitterMs: 0,
      peakG: 0,
      peakMag: 0,
      onsetTimes: { gentle: null, normal: null, hard: null },
      thresholdTimes: { gentle: null, normal: null, hard: null },
      rewindMs: { gentle: null, normal: null, hard: null },
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > 0 && dt < 100) intervals.push(dt);
  }
  const meanInterval = intervals.length > 0
    ? intervals.reduce((s, v) => s + v, 0) / intervals.length
    : 0;
  const variance = intervals.length > 0
    ? intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / intervals.length
    : 0;
  const jitter = Math.sqrt(variance);

  let peakMag = 0;
  for (const s of samples) if (s.mag > peakMag) peakMag = s.mag;

  // For each sensitivity, find the FIRST sample that crossed threshold
  // (with 5 sustained samples), then walk back to the jerk-onset.
  const SUSTAINED = 5;
  const SLOPE_WINDOW = 4;
  const ONSET_SLOPE = 0.004;
  const MAX_REWIND_MS = 150;

  const findOnset = (confirmIdx: number, confirmTime: number): number => {
    let onsetIdx = confirmIdx;
    for (let i = confirmIdx; i >= SLOPE_WINDOW; i--) {
      if (samples[i].t < confirmTime - MAX_REWIND_MS) break;
      const dt = samples[i].t - samples[i - SLOPE_WINDOW].t;
      if (dt <= 0) continue;
      const slope = (samples[i].mag - samples[i - SLOPE_WINDOW].mag) / dt;
      if (slope >= ONSET_SLOPE) {
        onsetIdx = i - SLOPE_WINDOW;
      } else break;
    }
    return samples[onsetIdx].t;
  };

  const analyzeFor = (threshold: number) => {
    let sustained = 0;
    let firstAbove: number | null = null;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].mag >= threshold) {
        if (sustained === 0) firstAbove = samples[i].t;
        sustained += 1;
        if (sustained >= SUSTAINED) {
          const onset = findOnset(i, samples[i].t);
          return { onset, threshold: firstAbove! };
        }
      } else {
        sustained = 0;
        firstAbove = null;
      }
    }
    return { onset: null, threshold: null };
  };

  const g = analyzeFor(SENSITIVITY_THRESHOLDS.gentle);
  const n = analyzeFor(SENSITIVITY_THRESHOLDS.normal);
  const h = analyzeFor(SENSITIVITY_THRESHOLDS.hard);

  return {
    totalSamples: samples.length,
    durationMs: samples[samples.length - 1].t - samples[0].t,
    meanIntervalMs: meanInterval,
    jitterMs: jitter,
    peakG: peakMag / 9.81,
    peakMag,
    onsetTimes: { gentle: g.onset, normal: n.onset, hard: h.onset },
    thresholdTimes: { gentle: g.threshold, normal: n.threshold, hard: h.threshold },
    rewindMs: {
      gentle: g.onset != null && g.threshold != null ? g.threshold - g.onset : null,
      normal: n.onset != null && n.threshold != null ? n.threshold - n.onset : null,
      hard:   h.onset != null && h.threshold != null ? h.threshold - h.onset : null,
    },
  };
}

type Mode = "idle" | "capturing" | "result";

export default function DiagnosticScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("idle");
  const [liveG, setLiveG] = useState(0);
  const [livePeak, setLivePeak] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [available, setAvailable] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [countdown, setCountdown] = useState(0);

  const samplesRef = useRef<Sample[]>([]);
  const offsetRef = useRef<number | null>(null);
  const captureStartRef = useRef<number>(0);
  const subRef = useRef<{ remove: () => void } | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") { setAvailable(false); return; }
    DeviceMotion.isAvailableAsync().then(setAvailable);
  }, []);

  const stopCapture = () => {
    if (subRef.current) { subRef.current.remove(); subRef.current = null; }
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  useEffect(() => () => stopCapture(), []);

  const startCapture = () => {
    if (!available || mode === "capturing") return;
    samplesRef.current = [];
    offsetRef.current = null;
    setLiveG(0);
    setLivePeak(0);
    setLiveCount(0);
    setResult(null);
    setMode("capturing");
    setCountdown(Math.ceil(CAPTURE_DURATION_MS / 1000));

    captureStartRef.current = performance.now();

    DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subRef.current = DeviceMotion.addListener(({ acceleration }) => {
      if (!acceleration) return;
      const perfNow = performance.now();
      let sampleT = perfNow;
      const rawTs = (acceleration as { timestamp?: number }).timestamp;
      if (rawTs != null && Number.isFinite(rawTs)) {
        const tsMs = tsToMs(rawTs);
        if (offsetRef.current === null) offsetRef.current = perfNow - tsMs;
        sampleT = tsMs + offsetRef.current;
        if (sampleT > perfNow || sampleT < perfNow - 200) sampleT = perfNow;
      }
      const mag = magnitude3(acceleration.x, acceleration.y, acceleration.z);
      samplesRef.current.push({ t: sampleT, mag });
      setLiveG(mag / 9.81);
      setLivePeak(p => (mag / 9.81 > p ? mag / 9.81 : p));
      setLiveCount(samplesRef.current.length);
    });

    tickRef.current = setInterval(() => {
      const elapsed = performance.now() - captureStartRef.current;
      const remaining = Math.max(0, Math.ceil((CAPTURE_DURATION_MS - elapsed) / 1000));
      setCountdown(remaining);
    }, 250);

    stopTimerRef.current = setTimeout(() => {
      stopCapture();
      const analyzed = analyzeCapture(samplesRef.current);
      setResult(analyzed);
      setMode("result");
    }, CAPTURE_DURATION_MS);
  };

  const reset = () => {
    stopCapture();
    setMode("idle");
    setResult(null);
    setLiveG(0);
    setLivePeak(0);
    setLiveCount(0);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Diagnostics", headerShown: false }} />
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={20} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
            <Text style={[styles.backText, { color: colors.foreground }]}>BACK</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>DIAGNOSTICS</Text>
          <View style={{ width: 60 }} />
        </View>

        {!available && (
          <View style={[styles.card, { borderColor: colors.border }]}>
            <Text style={[styles.warn, { color: colors.mutedForeground }]}>
              Motion sensor not available on this platform. Run on a real Android device.
            </Text>
          </View>
        )}

        {available && (
          <>
            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>LIVE</Text>
              <View style={styles.bigRow}>
                <View>
                  <Text style={[styles.bigVal, { color: colors.foreground }]}>{liveG.toFixed(2)}</Text>
                  <Text style={[styles.bigSub, { color: colors.mutedForeground }]}>g now</Text>
                </View>
                <View>
                  <Text style={[styles.bigVal, { color: colors.primary }]}>{livePeak.toFixed(2)}</Text>
                  <Text style={[styles.bigSub, { color: colors.mutedForeground }]}>peak g</Text>
                </View>
                <View>
                  <Text style={[styles.bigVal, { color: colors.foreground }]}>{liveCount}</Text>
                  <Text style={[styles.bigSub, { color: colors.mutedForeground }]}>samples</Text>
                </View>
              </View>
              {mode === "capturing" && (
                <Text style={[styles.countdown, { color: colors.greenOn }]}>
                  CAPTURING — {countdown}s
                </Text>
              )}
            </View>

            <Pressable
              onPress={mode === "result" ? reset : startCapture}
              disabled={mode === "capturing"}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor:
                    mode === "capturing" ? colors.card :
                    mode === "result"    ? colors.secondary :
                    colors.primary,
                  opacity: pressed ? 0.85 : mode === "capturing" ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[styles.btnText, {
                color: mode === "result" ? colors.foreground : colors.primaryForeground,
              }]}>
                {mode === "capturing" ? "RECORDING…" : mode === "result" ? "AGAIN" : "ARM 5s CAPTURE"}
              </Text>
            </Pressable>

            {mode === "idle" && (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Press ARM, then perform a real launch (or whip the phone forward) within 5 seconds.
                The capture analyzes onset, threshold-crossing, and timing precision for each sensitivity preset.
              </Text>
            )}

            {result && (
              <>
                <View style={[styles.card, { borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>SAMPLE STATS</Text>
                  <Row label="Total samples"      value={`${result.totalSamples}`} />
                  <Row label="Duration"           value={`${result.durationMs.toFixed(0)} ms`} />
                  <Row label="Mean interval"      value={`${result.meanIntervalMs.toFixed(2)} ms`}
                       sub={`target ${SAMPLE_INTERVAL_MS} ms (${(1000 / result.meanIntervalMs).toFixed(0)} Hz achieved)`} />
                  <Row label="Jitter (σ)"         value={`${result.jitterMs.toFixed(2)} ms`} />
                  <Row label="Peak G"             value={`${result.peakG.toFixed(3)} g`}
                       sub={`${result.peakMag.toFixed(2)} m/s²`} />
                </View>

                <View style={[styles.card, { borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
                    PER-SENSITIVITY DETECTION
                  </Text>
                  <SensitivityRow label="GENTLE  (1.5 m/s²)" rewind={result.rewindMs.gentle} fired={result.onsetTimes.gentle != null} colors={colors} />
                  <SensitivityRow label="NORMAL  (2.5 m/s²)" rewind={result.rewindMs.normal} fired={result.onsetTimes.normal != null} colors={colors} />
                  <SensitivityRow label="HARD    (4.5 m/s²)" rewind={result.rewindMs.hard}   fired={result.onsetTimes.hard   != null} colors={colors} />
                  <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
                    Rewind = ms shaved off RT by the jerk-onset algorithm vs naive threshold-crossing.
                  </Text>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.rowVal, { color: colors.foreground }]}>{value}</Text>
        {sub && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text>}
      </View>
    </View>
  );
}

function SensitivityRow({
  label, rewind, fired, colors,
}: { label: string; rewind: number | null; fired: boolean; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>{label}</Text>
      <Text style={[styles.rowVal, {
        color: fired ? colors.greenOn : colors.mutedForeground,
        fontVariant: ["tabular-nums"],
      }]}>
        {fired ? `fired • rewind ${rewind!.toFixed(1)} ms` : "did not fire"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: 18, gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, width: 60 },
  backText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  title: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 4 },
  card: {
    borderWidth: 1, borderRadius: 12, padding: 14, gap: 8,
  },
  cardLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 4 },
  cardFoot: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 14 },
  bigRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  bigVal: { fontSize: 26, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  bigSub: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  countdown: {
    fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 2, textAlign: "center", marginTop: 4,
  },
  btn: {
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  btnText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 3 },
  hint: {
    fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, textAlign: "center",
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rowVal:   { fontSize: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  rowSub:   { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  warn: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
