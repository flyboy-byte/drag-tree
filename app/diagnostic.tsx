import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { LatencyCheck } from "@/components/LatencyCheck";
import { TimeSlipCard } from "@/components/TimeSlipCard";
import { SENSITIVITY_THRESHOLDS } from "@/hooks/useAccelerometer";
import { launchTelemetry, type RealLaunchTelemetry } from "@/lib/launchTelemetry";
import { settings, type SensitivityKey } from "@/lib/settings";
import { sessionLock } from "@/lib/sessionLock";
import { getHardwareKeySource } from "@/lib/hardwareKeys";
import { sustainedPeak, suggestSensitivity, NOISE_MARGIN } from "@/lib/sensorNoise";
import { detectInRecording, type MotionSample } from "@/lib/launchDetector";
import { getMotionKind, subscribeMotion, activeMotionKind, type MotionKind } from "@/lib/motionSource";

const SENS_OPTIONS: { key: SensitivityKey; label: string; sub: string }[] = [
  { key: "gentle", label: "GENTLE", sub: "0.15g" },
  { key: "normal", label: "NORMAL", sub: "0.25g" },
  { key: "hard",   label: "HARD",   sub: "0.46g" },
  { key: "custom", label: "CUSTOM", sub: "adj."  },
];

const CAPTURE_DURATION_MS = 5000;
const SPARK_BARS = 60;

type Sample = MotionSample;

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
  noiseMag: number;  // strongest sustained level (m/s²) — what a launch gate would see
  kind: MotionKind;  // which sensor produced the capture
  spark: number[];   // downsampled magnitudes (0..1) for sparkline
  perSensitivity: { gentle: PerSensitivityResult; normal: PerSensitivityResult; hard: PerSensitivityResult };
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
  const d = detectInRecording(samples, threshold);
  if (!d) {
    return { fired: false, onsetMs: null, thresholdMs: null, confirmMs: null,
             rewindMs: null, onsetToThresholdMs: null, thresholdToConfirmMs: null };
  }
  return {
    fired: true,
    onsetMs: d.onsetT - t0,
    thresholdMs: d.thresholdT - t0,
    confirmMs: d.confirmT - t0,
    rewindMs: d.confirmT - d.onsetT,
    onsetToThresholdMs: d.thresholdT - d.onsetT,
    thresholdToConfirmMs: d.confirmT - d.thresholdT,
  };
}

function analyzeCapture(samples: Sample[], kind: MotionKind): CaptureResult {
  if (samples.length === 0) {
    return {
      totalSamples: 0, durationMs: 0, meanIntervalMs: 0, jitterMs: 0, achievedHz: 0,
      peakG: 0, peakMag: 0, noiseMag: 0, kind, spark: new Array(SPARK_BARS).fill(0),
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
    noiseMag: sustainedPeak(samples),
    kind,
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
  const captureStartRef = useRef<number>(0);
  const kindRef = useRef<MotionKind>("none");
  const subRef = useRef<(() => void) | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparkTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to the most recent real-session launch telemetry
  const realLaunch = useSyncExternalStore<RealLaunchTelemetry | null>(
    launchTelemetry.subscribe,
    launchTelemetry.get,
    launchTelemetry.get,
  );

  // Subscribe to user preferences
  const appSettings = useSyncExternalStore(settings.subscribe, settings.get, settings.get);

  // Subscribe to session lock (separate store so the home screen's phase
  // transitions don't trigger settings re-renders on this screen).
  const isSessionLocked = useSyncExternalStore(sessionLock.subscribe, sessionLock.get, sessionLock.get);
  const keySource = getHardwareKeySource();

  useEffect(() => {
    if (Platform.OS === "web") { setAvailable(false); return; }
    getMotionKind().then(k => setAvailable(k !== "none")).catch(() => setAvailable(false));
  }, []);

  const stopCapture = () => {
    if (subRef.current)      { subRef.current(); subRef.current = null; }
    if (stopTimerRef.current){ clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (tickRef.current)     { clearInterval(tickRef.current); tickRef.current = null; }
    if (sparkTickRef.current){ clearInterval(sparkTickRef.current); sparkTickRef.current = null; }
  };
  useEffect(() => () => stopCapture(), []);

  const startCapture = () => {
    if (!available || mode === "capturing") return;
    samplesRef.current = [];
    setLiveG(0); setLivePeak(0); setLiveCount(0);
    setLiveSpark(new Array(SPARK_BARS).fill(0));
    setResult(null);
    setMode("capturing");
    setCountdown(Math.ceil(CAPTURE_DURATION_MS / 1000));
    captureStartRef.current = performance.now();

    subRef.current = subscribeMotion(s => {
      samplesRef.current.push(s);
      const g = s.mag / 9.81;
      setLivePeak(p => (g > p ? g : p));
    });
    kindRef.current = activeMotionKind();

    // Update sample count + live sparkline at 30 Hz, not on every sample
    sparkTickRef.current = setInterval(() => {
      const samples = samplesRef.current;
      setLiveCount(samples.length);
      if (samples.length > 0) setLiveG(samples[samples.length - 1].mag / 9.81);
      if (samples.length > 0) setLiveSpark(downsample(samples, SPARK_BARS));
    }, 33);

    tickRef.current = setInterval(() => {
      const elapsed = performance.now() - captureStartRef.current;
      const remaining = Math.max(0, Math.ceil((CAPTURE_DURATION_MS - elapsed) / 1000));
      setCountdown(remaining);
    }, 250);

    stopTimerRef.current = setTimeout(() => {
      stopCapture();
      setResult(analyzeCapture(samplesRef.current, kindRef.current));
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
      <Stack.Screen options={{ title: "Settings", headerShown: false }} />
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={20} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
            <Text style={[styles.backText, { color: colors.foreground }]} maxFontSizeMultiplier={1.2}>BACK</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]} maxFontSizeMultiplier={1.2}>SETTINGS</Text>
          <View style={{ width: 60 }} />
        </View>

        {isSessionLocked && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Finish or reset the current run to change settings.
          </Text>
        )}

        {/* ── LAUNCH: how a run is triggered ───────────────────────── */}
        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>LAUNCH</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Motion Sensor</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Use the accelerometer to detect your real launch. Turn off to
                use tap input only.
              </Text>
            </View>
            <Switch
              value={appSettings.sensorEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ sensorEnabled: v });
              }}
              disabled={isSessionLocked}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.sensorEnabled ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="Motion sensor toggle"
              accessibilityHint="Enables or disables accelerometer launch detection"
            />
          </View>

          <View style={[styles.divider, { borderColor: colors.border }]} />

          {/* ── Sensor Sensitivity ── */}
          <View style={{ gap: 10 }}>
            <View>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Sensor Sensitivity</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 3 }]}>
                How hard a launch has to be to count. Lower = easier to trigger.
                If it fires on its own or misses your launch, change this — the
                accelerometer test below can suggest one. CUSTOM sets an exact value.
              </Text>
            </View>
            <View style={styles.sensChipRow}>
              {SENS_OPTIONS.map(opt => (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.sensChip,
                    {
                      backgroundColor: appSettings.sensitivity === opt.key ? colors.secondary : "transparent",
                      borderColor: appSettings.sensitivity === opt.key ? colors.border : "transparent",
                      opacity: isSessionLocked ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (isSessionLocked) return;
                    Haptics.selectionAsync();
                    settings.set({ sensitivity: opt.key });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Set sensitivity to ${opt.label.toLowerCase()}`}
                  accessibilityState={{ selected: appSettings.sensitivity === opt.key, disabled: isSessionLocked }}
                >
                  <Text style={[styles.sensChipLabel, { color: appSettings.sensitivity === opt.key ? colors.foreground : colors.mutedForeground }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.sensChipSub, { color: colors.mutedForeground }]}>
                    {opt.key === "custom"
                      ? `${(appSettings.customThreshold / 9.81).toFixed(2)}g`
                      : opt.sub}
                  </Text>
                </Pressable>
              ))}
            </View>
            {appSettings.sensitivity === "custom" && (
              <View style={styles.sensStepRow}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    settings.set({
                      customThreshold: Math.max(0.8, Math.round((appSettings.customThreshold - 0.1) * 10) / 10),
                    });
                  }}
                  hitSlop={10}
                  style={[styles.sensStepBtn, { borderColor: colors.border }]}
                  accessibilityLabel="Decrease launch threshold"
                >
                  <Text style={[styles.sensStepBtnText, { color: colors.foreground }]}>−</Text>
                </Pressable>
                <View style={styles.sensStepVal}>
                  <Text style={[styles.sensStepValMain, { color: colors.foreground }]}>
                    {appSettings.customThreshold.toFixed(1)} m/s²
                  </Text>
                  <Text style={[styles.sensStepValSub, { color: colors.mutedForeground }]}>
                    {(appSettings.customThreshold / 9.81).toFixed(2)}g · gentle is 0.15g
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    settings.set({
                      customThreshold: Math.min(6.0, Math.round((appSettings.customThreshold + 0.1) * 10) / 10),
                    });
                  }}
                  hitSlop={10}
                  style={[styles.sensStepBtn, { borderColor: colors.border }]}
                  accessibilityLabel="Increase launch threshold"
                >
                  <Text style={[styles.sensStepBtnText, { color: colors.foreground }]}>+</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={[styles.divider, { borderColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>FLOOR IT Button</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Show an on-screen button to trigger your launch and red-light.
                Useful for home practice or testing timing without a car.
              </Text>
            </View>
            <Switch
              value={appSettings.showFloorIt}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ showFloorIt: v });
              }}
              disabled={isSessionLocked}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.showFloorIt ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="FLOOR IT button toggle"
              accessibilityHint="Shows an on-screen launch button on the home screen"
            />
          </View>

          <View style={[styles.divider, { borderColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Hold to Launch</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Hold the button through the tree and let go on green, like a trans-brake
                button. Letting go early is a red light.
              </Text>
            </View>
            <Switch
              value={appSettings.holdToLaunch}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ holdToLaunch: v });
              }}
              disabled={isSessionLocked}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.holdToLaunch ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="Hold to launch toggle"
              accessibilityHint="Hold the button during the tree and release on green"
            />
          </View>

          {keySource && (
            <>
              <View style={[styles.divider, { borderColor: colors.border }]} />
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.rowVal, { color: colors.foreground }]}>
                    {keySource.kind === "keyboard" ? "Keyboard Launch" : "Volume Buttons & Remotes"}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    {keySource.kind === "keyboard"
                      ? "Space or Enter works like the on-screen button — hold it if Hold to Launch is on."
                      : "Use a volume button, a wired headphone button or a Bluetooth camera remote as the " +
                        "launch button. Works like the on-screen button — hold it if Hold to Launch is on. " +
                        "On the main screen the volume buttons won't change the volume while this is on."}
                  </Text>
                </View>
                <Switch
                  value={appSettings.keyLaunch}
                  onValueChange={(v) => {
                    Haptics.selectionAsync();
                    settings.set({ keyLaunch: v });
                  }}
                  disabled={isSessionLocked}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={appSettings.keyLaunch ? colors.primaryForeground : colors.mutedForeground}
                  accessibilityLabel="Hardware button launch toggle"
                  accessibilityHint="Use volume buttons or a remote as the launch button"
                />
              </View>
            </>
          )}
        </View>

        {/* ── ACCELEROMETER TEST: noise check next to the sensitivity it informs ── */}
        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ACCELEROMETER TEST</Text>
          {!available ? (
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              No motion sensor here. Run the app on an Android phone to use it.
            </Text>
          ) : (
            <>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Records 5 seconds of what the motion sensor picks up. Put the phone where
                you'll use it — mounted in the car with the engine running is best — and
                leave it still. The result is the background vibration, and the most
                sensitive setting it won't set off. Or just watch the numbers for fun.
              </Text>
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

              <Pressable
                onPress={mode === "result" ? reset : startCapture}
                disabled={mode === "capturing" || isSessionLocked}
                accessibilityRole="button"
                accessibilityLabel={mode === "result" ? "Run the accelerometer test again" : "Start the 5 second accelerometer test"}
                style={({ pressed }) => [
                  styles.btn,
                  {
                    backgroundColor:
                      mode === "capturing" ? colors.card :
                      mode === "result"    ? colors.secondary :
                      colors.primary,
                    opacity: pressed ? 0.85 : mode === "capturing" || isSessionLocked ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.btnText, {
                  color: mode === "result" ? colors.foreground : colors.primaryForeground,
                }]}>
                  {mode === "capturing" ? "RECORDING…" : mode === "result" ? "TEST AGAIN" : "START TEST"}
                </Text>
                {mode === "idle" && (
                  <Text style={[styles.btnSub, { color: colors.primaryForeground }]}>5 s capture</Text>
                )}
              </Pressable>

              {result && (() => {
                const suggestion = suggestSensitivity(result.noiseMag, SENSITIVITY_THRESHOLDS);
                return (
                  <View style={styles.noiseBox}>
                    <Row label="Background noise" value={`${(result.noiseMag / 9.81).toFixed(2)} g`}
                         sub="strongest steady level, ignoring single bumps" />
                    <Row label="Suggested sensitivity"
                         value={suggestion ? suggestion.toUpperCase() : "CUSTOM"}
                         sub={suggestion
                           ? `${(SENSITIVITY_THRESHOLDS[suggestion] / 9.81).toFixed(2)} g`
                           : `above ${(result.noiseMag * NOISE_MARGIN / 9.81).toFixed(2)} g — or the test caught a launch`} />
                    {suggestion && appSettings.sensitivity !== suggestion && (
                      <Pressable
                        onPress={() => { Haptics.selectionAsync(); settings.set({ sensitivity: suggestion }); }}
                        disabled={isSessionLocked}
                        style={({ pressed }) => [styles.useBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${suggestion} sensitivity`}
                      >
                        <Text style={[styles.useBtnText, { color: colors.foreground }]}>USE {suggestion.toUpperCase()}</Text>
                      </Pressable>
                    )}
                    <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
                      Only a guide — if the phone moved or you launched during the test, the
                      number shows that instead of background noise.
                    </Text>
                  </View>
                );
              })()}
            </>
          )}
        </View>

        {/* ── TREE & DISPLAY ─────────────────────────────────────────── */}
        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>TREE & DISPLAY</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Sportsman Tree</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Switch from Pro Tree (.400s, all ambers together) to Sportsman Tree (.500s, ambers count down one at a time).
              </Text>
            </View>
            <Switch
              value={appSettings.treeMode === "full"}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ treeMode: v ? "full" : "pro" });
              }}
              disabled={isSessionLocked}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.treeMode === "full" ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="Sportsman Tree toggle"
              accessibilityHint="Switches from Pro Tree (.400s) to Sportsman Tree (.500s)"
            />
          </View>

          <View style={[styles.divider, { borderColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Sound</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                A beep on green and a tone with your result. Plays at media volume.
              </Text>
            </View>
            <Switch
              value={appSettings.soundEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ soundEnabled: v });
              }}
              disabled={isSessionLocked}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.soundEnabled ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="Sound toggle"
              accessibilityHint="Enables or disables audio cues during the tree sequence"
            />
          </View>

          <View style={[styles.divider, { borderColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Series Mode</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Run back-to-back stages and see your average RT, best, worst, and a
                consistency score after N runs.
              </Text>
            </View>
            <Switch
              value={appSettings.seriesEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ seriesEnabled: v });
              }}
              disabled={isSessionLocked}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.seriesEnabled ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="Series mode toggle"
              accessibilityHint="Enables back-to-back series practice with a summary after N runs"
            />
          </View>

          {appSettings.seriesEnabled && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Runs per series</Text>
              <View style={styles.sensChipRow}>
                {([3, 5, 10] as const).map(n => (
                  <Pressable
                    key={n}
                    style={[
                      styles.sensChip,
                      {
                        backgroundColor: appSettings.seriesSize === n ? colors.secondary : "transparent",
                        borderColor: appSettings.seriesSize === n ? colors.border : "transparent",
                        opacity: isSessionLocked ? 0.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (isSessionLocked) return;
                      Haptics.selectionAsync();
                      settings.set({ seriesSize: n });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set series size to ${n} runs`}
                    accessibilityState={{ selected: appSettings.seriesSize === n, disabled: isSessionLocked }}
                  >
                    <Text style={[styles.sensChipLabel, { color: appSettings.seriesSize === n ? colors.foreground : colors.mutedForeground }]}>
                      {n}
                    </Text>
                    <Text style={[styles.sensChipSub, { color: colors.mutedForeground }]}>runs</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.divider, { borderColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowVal, { color: colors.foreground }]}>Trend Chart</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                Show the run-history bar chart on the home screen after 2+ runs.
              </Text>
            </View>
            <Switch
              value={appSettings.showTrend}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                settings.set({ showTrend: v });
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={appSettings.showTrend ? colors.primaryForeground : colors.mutedForeground}
              accessibilityLabel="Trend chart toggle"
              accessibilityHint="Shows or hides the run-history trend chart on the home screen"
            />
          </View>
        </View>

        <TimeSlipCard />

        <LatencyCheck disabled={isSessionLocked || mode === "capturing"} />

        {(realLaunch || result) && (
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            SENSOR DETAILS
          </Text>
        )}

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
            <Row label="Sensor"
                 value={sensorLabel(realLaunch.source)}
                 sub={sensorSub(realLaunch.source)} />
            <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
              Updated automatically after each real green-light launch.
            </Text>
          </View>
        )}

        {result && (
          <>
            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>SAMPLE STATS</Text>
              <Row label="Total samples"  value={`${result.totalSamples}`} />
              <Row label="Duration"       value={`${result.durationMs.toFixed(0)} ms`} />
              <Row label="Mean interval"  value={`${result.meanIntervalMs.toFixed(2)} ms`}
                   sub={`${result.achievedHz.toFixed(0)} Hz achieved`} />
              <Row label="Sensor"         value={sensorLabel(result.kind)} sub={sensorSub(result.kind)} />
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
      </ScrollView>
    </>
  );
}

function sensorLabel(kind: MotionKind): string {
  return kind === "linear" ? "Linear acceleration" : kind === "accel" ? "Accelerometer" : "—";
}
function sensorSub(kind: MotionKind): string | undefined {
  return kind === "linear" ? "gravity removed by Android"
       : kind === "accel"  ? "gravity filtered by the app — keep the phone mounted"
       : undefined;
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
  btnSub: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, marginTop: 2, opacity: 0.75 },
  noiseBox: { gap: 4 },
  useBtn: { alignSelf: "flex-end", borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  useBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, textAlign: "center", paddingHorizontal: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, gap: 12 },
  rowLabel: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 1 },
  rowVal:   { fontSize: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  rowSub:   { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  warn: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 10 },
  sensChipRow: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  sensChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  sensChipLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  sensChipSub: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 1 },
  sensStepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  sensStepBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sensStepBtnText: { fontSize: 20, fontFamily: "Inter_600SemiBold", lineHeight: 24 },
  sensStepVal: { alignItems: "center", flex: 1 },
  sensStepValMain: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  sensStepValSub: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2, marginTop: 6, paddingHorizontal: 4 },
  sensBlock: { gap: 4, paddingVertical: 6 },
  sensLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  sensVal: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sensGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  mini: { flex: 1 },
  miniLabel: { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  miniVal: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
});
