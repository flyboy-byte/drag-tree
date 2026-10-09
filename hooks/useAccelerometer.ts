import { useEffect, useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import { createLaunchDetector } from "@/lib/launchDetector";
import { getMotionKind, subscribeMotion, activeMotionKind, type MotionKind } from "@/lib/motionSource";

export type LaunchSensitivity = "gentle" | "normal" | "hard";

// Thresholds in m/s² of TRUE LINEAR ACCELERATION (gravity already removed
// by Android's sensor fusion).
//   gentle ~0.15g — FWD street car, light throttle
//   normal ~0.25g — RWD or sport car, moderate launch
//   hard   ~0.46g — drag-prepped, slicks, hard launch
export const SENSITIVITY_THRESHOLDS: Record<LaunchSensitivity, number> = {
  gentle: 1.5,
  normal: 2.5,
  hard:   4.5,
};

// Detection itself (sustain gate + onset rewind) lives in lib/launchDetector;
// the sensor stream in lib/motionSource. This hook wires them to the run.

// The G meter only needs to look live; the sensor runs at up to 200 Hz.
const METER_INTERVAL_MS = 33;

export interface LaunchTelemetry {
  greenAt: number | null;        // for cross-checking; not always known here
  onsetTime: number;             // jerk-based onset (passed to RT)
  thresholdTime: number;         // first sample that crossed magnitude threshold
  confirmTime: number;           // sample where the sustain gate was met
  peakG: number;                 // max linear-G observed in the buffer
  rewindMs: number;              // confirmTime - onsetTime
  sampleIntervalMean: number;    // observed mean ms between samples
  source: MotionKind;            // "linear" (Android fusion) or "accel" (filtered here)
}

interface UseAccelerometerOptions {
  armed: boolean;
  /** Launch-detection threshold in m/s². Use SENSITIVITY_THRESHOLDS for presets. */
  threshold: number;
  // candidateTime is the JERK-ONSET timestamp (rewound from the confirmation
  // sample), so RT reflects the start of acceleration — not the moment we
  // crossed threshold or the moment we confirmed.
  onLaunch: (candidateTime: number) => void;
  onRedLight: (onsetTime: number) => void;
  watchForRedLight: boolean;
  // Optional: receives full telemetry for the most recent launch.
  onLaunchTelemetry?: (t: LaunchTelemetry) => void;
}

export function useAccelerometer({
  armed,
  threshold,
  onLaunch,
  onRedLight,
  watchForRedLight,
  onLaunchTelemetry,
}: UseAccelerometerOptions) {
  const firedRef = useRef(false);

  // Stable refs for the caller's callbacks. Updating refs is synchronous and
  // doesn't trigger a re-render, so the sensor subscription effect never needs
  // to tear down just because the parent re-rendered. Without this, the
  // subscription would be torn down and re-created constantly, leaving small
  // gaps in coverage during a real launch.
  const onLaunchRef          = useRef(onLaunch);
  const onRedLightRef        = useRef(onRedLight);
  const onLaunchTelemetryRef = useRef(onLaunchTelemetry);
  useEffect(() => { onLaunchRef.current = onLaunch; });
  useEffect(() => { onRedLightRef.current = onRedLight; });
  useEffect(() => { onLaunchTelemetryRef.current = onLaunchTelemetry; });

  const [currentG,    setCurrentG]    = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  // Mode refs: the sensor stream runs across the whole run (staging → go),
  // so a phase change swaps the detector instead of restarting the sensor.
  const armedRef    = useRef(armed);
  const watchRef    = useRef(watchForRedLight);
  const detectorRef = useRef(createLaunchDetector(threshold));
  useEffect(() => {
    armedRef.current = armed;
    watchRef.current = watchForRedLight;
    firedRef.current = false;
    detectorRef.current = createLaunchDetector(threshold, detectorRef.current.buffer);
  }, [armed, watchForRedLight, threshold]);

  // Availability
  useEffect(() => {
    if (Platform.OS === "web") { setIsAvailable(false); return; }
    getMotionKind().then(k => setIsAvailable(k !== "none")).catch(() => setIsAvailable(false));
  }, []);

  // ── Sensor subscription — while a run can be decided by motion ──
  const active = armed || watchForRedLight;
  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;
    if (!active) {
      setCurrentG(0);
      return;
    }

    let lastT: number | null = null;
    let intervalSum = 0;
    let intervalCount = 0;
    let peakMag = 0;
    let lastMeter = 0;

    const unsubscribe = subscribeMotion(s => {
      const now = performance.now();
      if (now - lastMeter >= METER_INTERVAL_MS) {
        lastMeter = now;
        setCurrentG(s.mag / 9.81);
      }
      if (lastT !== null) {
        const dt = s.t - lastT;
        if (dt > 0 && dt < 100) { intervalSum += dt; intervalCount += 1; }
      }
      lastT = s.t;
      if (s.mag > peakMag) peakMag = s.mag;

      const hit = detectorRef.current.push(s);
      if (!hit || firedRef.current) return;
      if (!armedRef.current && !watchRef.current) return;
      firedRef.current = true;
      onLaunchTelemetryRef.current?.({
        greenAt: null,
        onsetTime: hit.onsetT,
        thresholdTime: hit.thresholdT,
        confirmTime: hit.confirmT,
        peakG: peakMag / 9.81,
        rewindMs: hit.confirmT - hit.onsetT,
        sampleIntervalMean: intervalCount > 0 ? intervalSum / intervalCount : 0,
        source: activeMotionKind(),
      });
      if (armedRef.current) onLaunchRef.current(hit.onsetT);
      else                  onRedLightRef.current(hit.onsetT);
    });

    return () => {
      unsubscribe();
      detectorRef.current = createLaunchDetector(threshold);
    };
  // Callbacks and mode are read via refs so the subscription only tears
  // down when the run ends, not at each phase change.
  }, [isAvailable, active]);

  // ── Simulation (explicit button taps) ────────────────────────────────────
  // Fire immediately — no animation delay. The G-meter row is hidden the
  // instant phase changes to "result"/"redlight", so any pre-fire ramp
  // animation was always invisible. Capturing performance.now() at the call
  // site gives the most accurate reaction-time anchor for FLOOR IT taps.
  //
  // firedRef is set to true on fire and NOT guarded here because:
  //   - consecutive sensor-off runs: firedRef is always reset before fire, so
  //     the "stuck true" bug between runs is eliminated.
  //   - sensor-on + tap race: phase changes to "result" before the user's
  //     next touch event can be processed — double-fire is not reachable.
  // `at` lets a hardware button pass its own event time (more precise than
  // when the callback runs); taps default to now.
  const simulateLaunch = useCallback((at?: number) => {
    firedRef.current = true;
    onLaunchRef.current(at ?? performance.now());
  }, []);

  const simulateRedLight = useCallback((at?: number) => {
    firedRef.current = true;
    onRedLightRef.current(at ?? performance.now());
  }, []);

  return { currentG, isAvailable, simulateLaunch, simulateRedLight };
}
