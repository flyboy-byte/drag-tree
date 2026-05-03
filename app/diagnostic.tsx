import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { launchTelemetry, type RealLaunchTelemetry } from "@/lib/launchTelemetry";

const SAMPLE_INTERVAL_MS = 8;
const CAPTURE_DURATION_MS = 5000;
const SPARK_BARS = 60;

interface Sample { t: number; mag: number; }

function tsToMs(raw: number): number {
  if (raw > 1e12) return raw / 1e6;
  if (raw > 1e9)  return raw;
  if (raw > 1e6)  return raw;
  return raw * 1000;
}
function magnitude3(x: number, y: number, z: number): number {
  return Math.sqrt(x*x + y*y + z*z);
}

interface PerSensitivityResult {
  fired: boolean;
  onsetMs: number | null;       // ms since capture start
  thresholdMs: number | null;
  confirmMs: number | null;
  rewindMs: number | null;      // confirm - onset
  onsetToThresholdMs: number | null;
  thresholdToConfirmMs: number | null;
}
interface CaptureResult {
  totalSamples: number;
  durationMs: number;
  meanIntervalMs: number;
  jitterMs: number;
  achievedHz: number;
  peakG: number;
  peakMag: number;
  spark: number[];   // downsampled magnitudes (0..1) for sparkline
  perSensitivity: { gentle: PerSensitivityResult; normal: PerSensitivityResult; hard: PerSensitivityResult };
}

const SUSTAINED = 5;
const SLOPE_WINDOW = 4;
const ONSET_SLOPE = 0.004;
const MAX_REWIND_MS = 150;

function findOnset(samples: Sample[], confirmIdx: number, confirmTime: number): number {
  let onsetIdx = confirmIdx;
  for (let i = confirmIdx; i >= SLOPE_WINDOW; i--) {
    if (samples[i].t < confirmTime - MAX_REWIND_MS) break;
    const dt = samples[i].t - samples[i - SLOPE_WINDOW].t;
    if (dt <= 0) continue;
    const slope = (samples[i].mag - samples[i - SLOPE_WINDOW].mag) / dt;
    if (slope >= ONSET_SLOPE) onsetIdx = i - SLOPE_WINDOW;
    else break;
  }
  return samples[onsetIdx].t;
}

function downsample(samples: Sample[], n: number): number[] {
  if (samples.length === 0) return new Array(n).fill(0);
  let max = 0;
  for (const s of samples) if (s.mag > max) max = s.mag;
  if (max <= 0) max = 1;
  const out: number[] = new Array(n).fill(0);
  const stride = samples.length / n;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * stride);
    const end = Math.max(start + 1, Math.floor((i + 1) * stride));
    let bucketMax = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      if (samples[j].mag > bucketMax) bucketMax = samples[j].mag;
    }
    out[i] = bucketMax / max;
  }
  return out;
}

function analyzeFor(samples: Sample[], threshold: number, t0: number): PerSensitivityResult {
  let sustained = 0;
  let firstAbove: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].mag >= threshold) {
      if (sustained === 0) firstAbove = samples[i].t;
      sustained += 1;
      if (sustained >= SUSTAINED) {
        const confirmT = samples[i].t;
        const onsetT = findOnset(samples, i, confirmT);
        return {
          fired: true,
          onsetMs: onsetT - t0,
          thresholdMs: (firstAbove ?? confirmT) - t0,
          confirmMs: confirmT - t0,
          rewindMs: confirmT - onsetT,
          onsetToThresholdMs: (firstAbove ?? confirmT) - onsetT,
          thresholdToConfirmMs: confirmT - (firstAbove ?? confirmT),
        };
      }
    } else { sustained = 0; firstAbove = null; }
  }
  return { fired: false, onsetMs: null, thresholdMs: null, confirmMs: null,
           rewindMs: null, onsetToThresholdMs: null, thresholdToConfirmMs: null };
}

function analyzeCapture(samples: Sample[]): CaptureResult {
  if (samples.length === 0) {
    return {
      totalSamples: 0, durationMs: 0, meanIntervalMs: 0, jitterMs: 0, achievedHz: 0,
      peakG: 0, peakMag: 0, spark: new Array(SPARK_BARS).fill(0),
      perSensitivity: {
        gentle: analyzeFor([], SENSITIVITY_THRESHOLDS.gentle, 0),
        normal: analyzeFor([], SENSITIVITY_THRESHOLDS.normal, 0),
        hard:   analyzeFor([], SENSITIVITY_THRESHOLDS.hard,   0),
      },
    };
  }
  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i-1].t;
    if (dt > 0 && dt < 100) intervals.push(dt);
  }
  const meanInterval = intervals.length ? intervals.reduce((s,v) => s+v, 0) / intervals.length : 0;
  const variance = intervals.length ? intervals.reduce((s,v) => s + (v-meanInterval)**2, 0) / intervals.length : 0;
  const jitter = Math.sqrt(variance);
  let peakMag = 0;
  for (const s of samples) if (s.mag > peakMag) peakMag = s.mag;
  const t0 = samples[0].t;
  return {
    totalSamples: samples.length,
    durationMs: samples[samples.length-1].t - t0,
    meanIntervalMs: meanInterval,
    jitterMs: jitter,
    achievedHz: meanInterval > 0 ? 1000 / meanInterval : 0,
    peakG: peakMag / 9.81,
    peakMag,
    spark: downsample(samples, SPARK_BARS),
    perSensitivity: {
      gentle: analyzeFor(samples, SENSITIVITY_THRESHOLDS.gentle, t0),
      normal: analyzeFor(samples, SENSITIVITY_THRESHOLDS.normal, t0),
      hard:   analyzeFor(samples, SENSITIVITY_THRESHOLDS.hard,   t0),
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
  const [liveSpark, setLiveSpark] = useState<number[]>(() => new Array(SPARK_BARS).fill(0));
  const [available, setAvailable] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [countdown, setCountdown] = useState(0);

  const samplesRef = useRef<Sample[]>([]);
  const offsetRef = useRef<number | null>(null);
  const captureStartRef = useRef<number>(0);
  const subRef = useRef<{ remove: () => void } | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparkTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to the most recent real-session launch telemetry
  const realLaunch = useSyncExternalStore<RealLaunchTelemetry | null>(
    launchTelemetry.subscribe,
    launchTelemetry.get,
    launchTelemetry.get,
  );

  useEffect(() => {
    if (Platform.OS === "web") { setAvailable(false); return; }
    DeviceMotion.isAvailableAsync().then(setAvailable);
  }, []);

  const stopCapture = () => {
    if (subRef.current)      { subRef.current.remove(); subRef.current = null; }
    if (stopTimerRef.current){ clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (tickRef.current)     { clearInterval(tickRef.current); tickRef.current = null; }
    if (sparkTickRef.current){ clearInterval(sparkTickRef.current); sparkTickRef.current = null; }
  };
  useEffect(() => () => stopCapture(), []);

  const startCapture = () => {
    if (!available || mode === "capturing") return;
    samplesRef.current = [];
    offsetRef.current = null;
    setLiveG(0); setLivePeak(0); setLiveCount(0);
    setLiveSpark(new Array(SPARK_BARS).fill(0));
    setResult(null);
    setMode("capturing");
    setCountdown(Math.ceil(CAPTURE_DURATION_MS / 1000));
    captureStartRef.current = performance.now();

    DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subRef.current = DeviceMotion.addListener(({ acceleration, interval }) => {
      if (!acceleration) return;
      const perfNow = performance.now();
      let sampleT = perfNow;
      const rawTs = (acceleration as { timestamp?: number }).timestamp;
      if (rawTs != null && Number.isFinite(rawTs) && rawTs !== 0) {
        const tsMs = tsToMs(rawTs);
        if (offsetRef.current === null) offsetRef.current = perfNow - tsMs;
        sampleT = tsMs + offsetRef.current;
        if (sampleT > perfNow || sampleT < perfNow - 200) sampleT = perfNow - (interval ?? SAMPLE_INTERVAL_MS);
      } else {
        sampleT = perfNow - Math.max(0, Math.min(interval ?? SAMPLE_INTERVAL_MS, 50));
      }
      const mag = magnitude3(acceleration.x, acceleration.y, acceleration.z);
      samplesRef.current.push({ t: sampleT, mag });
      const g = mag / 9.81;
      setLiveG(g);
      setLivePeak(p => (g > p ? g : p));
    });

    // Update sample count + live sparkline at 30 Hz, not on every sample
    sparkTickRef.current = setInterval(() => {
      const samples = samplesRef.current;
      setLiveCount(samples.length);
      if (samples.length > 0) setLiveSpark(downsample(samples, SPARK_BARS));
    }, 33);

    tickRef.current = setInterval(() => {
      const elapsed = performance.now() - captureStartRef.current;
      const remaining = Math.max(0, Math.ceil((CAPTURE_DURATION_MS - elapsed) / 1000));
      setCountdown(remaining);
    }, 250);

    stopTimerRef.current = setTimeout(() => {
      stopCapture();
      setResult(analyzeCapture(samplesRef.current));
      setMode("result");
    }, CAPTURE_DURATION_MS);
  };

  const reset = () => {
    stopCapture();
    setMode("idle"); setResult(null);
    setLiveG(0); setLivePeak(0); setLiveCount(0);
    setLiveSpark(new Array(SPARK_BARS).fill(0));
  };

  const sparkData = mode === "result" && result ? result.spark : liveSpark;

  return (
    <>
      <Stack.Screen options={{ title: "Diagnostics", headerShown: false }} />
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
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

        {/* ── REAL LAUNCH BREAKDOWN (from most recent green-light run) ── */}
        {realLaunch && (
          <View style={[styles.card, { borderColor: colors.greenOn, borderWidth: 1 }]}>
            <Text style={[styles.cardLabel, { color: colors.greenOn }]}>LAST REAL LAUNCH</Text>
            <Row label="Reaction time (green → onset)"
                 value={realLaunch.greenToOnsetMs != null ? `${realLaunch.greenToOnsetMs.toFixed(1)} ms` : "—"}
                 sub={realLaunch.greenToOnsetMs != null ? `${(realLaunch.greenToOnsetMs / 1000).toFixed(3)} s` : undefined} />
            <Row label="Onset → threshold"     value={`${realLaunch.onsetToThresholdMs.toFixed(1)} ms`}
                 sub="time from ramp-start to threshold cross" />
            <Row label="Threshold → confirm"   value={`${realLaunch.thresholdToConfirmMs.toFixed(1)} ms`}
                 sub="confirmation delay (5 sustained samples)" />
            <Row label="Rewind savings"        value={`${realLaunch.rewindMs.toFixed(1)} ms`}
                 sub="latency removed by jerk-onset rewind" />
            <Row label="Peak G"                value={`${realLaunch.peakG.toFixed(3)} g`} />
            <Row label="Sample interval"       value={`${realLaunch.sampleIntervalMean.toFixed(2)} ms`}
                 sub={`${(1000/realLaunch.sampleIntervalMean).toFixed(0)} Hz achieved`} />
            <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
              Updated automatically after each real green-light launch.
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
              {/* Acceleration curve sparkline */}
              <View style={styles.sparkRow}>
                {sparkData.map((v, i) => (
                  <View
                    key={i}
                    style={[
                      styles.sparkBar,
                      {
                        height: Math.max(1, v * 56),
                        backgroundColor:
                          v > 0.7 ? colors.primary :
                          v > 0.3 ? colors.foreground :
                          colors.border,
                      },
                    ]}
                  />
                ))}
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

            {mode === "idle" && !realLaunch && (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Press ARM and perform a real launch (or whip the phone forward) within 5 seconds.
                The capture renders the acceleration curve and reports onset, threshold-crossing,
                confirmation delay, and timing precision for each sensitivity preset.
              </Text>
            )}

            {result && (
              <>
                <View style={[styles.card, { borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>SAMPLE STATS</Text>
                  <Row label="Total samples"  value={`${result.totalSamples}`} />
                  <Row label="Duration"       value={`${result.durationMs.toFixed(0)} ms`} />
                  <Row label="Mean interval"  value={`${result.meanIntervalMs.toFixed(2)} ms`}
                       sub={`target ${SAMPLE_INTERVAL_MS} ms · ${result.achievedHz.toFixed(0)} Hz achieved`} />
                  <Row label="Jitter (σ)"     value={`${result.jitterMs.toFixed(2)} ms`} />
                  <Row label="Peak G"         value={`${result.peakG.toFixed(3)} g`}
                       sub={`${result.peakMag.toFixed(2)} m/s²`} />
                </View>

                <View style={[styles.card, { borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
                    PER-SENSITIVITY DETECTION
                  </Text>
                  <SensitivityBlock label="GENTLE  (1.5 m/s²)" r={result.perSensitivity.gentle} colors={colors} />
                  <SensitivityBlock label="NORMAL  (2.5 m/s²)" r={result.perSensitivity.normal} colors={colors} />
                  <SensitivityBlock label="HARD    (4.5 m/s²)" r={result.perSensitivity.hard}   colors={colors} />
                  <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
                    onset = jerk-rewound start of acceleration · threshold = first sample over preset force ·
                    confirm = sustained-samples gate. Rewind = ms shaved off RT vs naive threshold-crossing.
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
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
        <Text style={[styles.rowVal, { color: colors.foreground }]}>{value}</Text>
        {sub && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text>}
      </View>
    </View>
  );
}

function SensitivityBlock({
  label, r, colors,
}: { label: string; r: PerSensitivityResult; colors: ReturnType<typeof useColors> }) {
  if (!r.fired) {
    return (
      <View style={styles.sensBlock}>
        <Text style={[styles.sensLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.sensVal, { color: colors.mutedForeground }]}>did not fire</Text>
      </View>
    );
  }
  return (
    <View style={[styles.sensBlock, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 }]}>
      <Text style={[styles.sensLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.sensGrid}>
        <Mini label="onset"       value={`${r.onsetMs!.toFixed(1)} ms`}     colors={colors} />
        <Mini label="threshold"   value={`${r.thresholdMs!.toFixed(1)} ms`} colors={colors} />
        <Mini label="confirm"     value={`${r.confirmMs!.toFixed(1)} ms`}   colors={colors} />
      </View>
      <View style={styles.sensGrid}>
        <Mini label="o→t"   value={`${r.onsetToThresholdMs!.toFixed(1)} ms`}   colors={colors} />
        <Mini label="t→c"   value={`${r.thresholdToConfirmMs!.toFixed(1)} ms`} colors={colors} />
        <Mini label="rewind" value={`${r.rewindMs!.toFixed(1)} ms`}            highlight colors={colors} />
      </View>
    </View>
  );
}

function Mini({ label, value, colors, highlight }: { label: string; value: string; colors: ReturnType<typeof useColors>; highlight?: boolean }) {
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.miniVal, { color: highlight ? colors.greenOn : colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: 18, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2, width: 60 },
  backText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  title: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 4 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  cardLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 4 },
  cardFoot: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 14 },
  bigRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  bigVal: { fontSize: 26, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  bigSub: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  sparkRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 60,
    gap: 1,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sparkBar: { flex: 1, borderRadius: 1, minHeight: 1 },
  countdown: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 2, textAlign: "center", marginTop: 4 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 3 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, textAlign: "center", paddingHorizontal: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, gap: 12 },
  rowLabel: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 1 },
  rowVal:   { fontSize: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  rowSub:   { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  warn: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  sensBlock: { gap: 4, paddingVertical: 6 },
  sensLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  sensVal: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sensGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  mini: { flex: 1 },
  miniLabel: { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  miniVal: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
});
