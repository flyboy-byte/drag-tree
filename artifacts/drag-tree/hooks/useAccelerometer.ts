import { useEffect, useRef, useCallback, useState } from "react";
import { DeviceMotion } from "expo-sensors";
import { Platform } from "react-native";

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

// JS-fallback target sample rate. Android 12+ requires the
// HIGH_SAMPLING_RATE_SENSORS permission for intervals < 200 ms (declared in
// app.json). The native module path uses SENSOR_DELAY_FASTEST (~200 Hz)
// directly on the sensor thread instead.
const SAMPLE_INTERVAL_MS = 8;

// Sustained confirmation: ~40 ms of held above-threshold force.
// At 125 Hz that's 5 consecutive samples. Bumps and vibration spikes are
// over in < 30 ms and get rejected.
const SUSTAINED_SAMPLES = 5;

// Rolling sample buffer for jerk-onset rewind. Holds ~150 ms of samples
// at 125 Hz — enough to find the start of a launch-acceleration ramp.
const BUFFER_SIZE = 24;

// Minimum slope (m/s² per ms) over a smoothing window to count as "rising".
// A real launch ramp from 0 → 1.5 m/s² in ~80 ms is slope ≈ 0.019.
// Hand-held noise floor over a 32 ms window averages ≈ 0.001–0.002.
// 0.004 sits comfortably between the two.
const ONSET_SLOPE = 0.004;

// Window (in samples) over which slope is computed when walking back.
// Wider window = more noise immunity, less precise onset.
const SLOPE_WINDOW = 4;

// Hard cap on how far backward in time we look for the onset.
const MAX_REWIND_MS = 150;

interface Sample {
  t: number;   // performance.now()-aligned ms
  mag: number; // linear-accel magnitude in m/s²
}

function magnitude3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

// Convert whatever unit the sensor's `timestamp` field uses into ms.
// Android raw is nanoseconds since boot; iOS is seconds since boot; some
// expo-sensors versions normalize differently. Detect by magnitude.
function tsToMs(raw: number): number {
  if (raw > 1e12) return raw / 1e6;  // nanoseconds
  if (raw > 1e9)  return raw;        // already ms (epoch-ish)
  if (raw > 1e6)  return raw;        // ms-scale uptime
  return raw * 1000;                  // seconds
}

// Walk backward from the confirmation sample to find the first sample where
// the rising slope died. That sample's timestamp ≈ true launch onset.
function findOnsetTimestamp(buf: Sample[], confirmTime: number): number {
  if (buf.length < SLOPE_WINDOW + 1) {
    return buf.length > 0 ? buf[buf.length - 1].t : confirmTime;
  }
  let onsetIdx = buf.length - 1;
  for (let i = buf.length - 1; i >= SLOPE_WINDOW; i--) {
    if (buf[i].t < confirmTime - MAX_REWIND_MS) break;
    const dt = buf[i].t - buf[i - SLOPE_WINDOW].t;
    if (dt <= 0) continue;
    const slope = (buf[i].mag - buf[i - SLOPE_WINDOW].mag) / dt;
    if (slope >= ONSET_SLOPE) {
      // Far edge of this window is part of the rising portion → keep walking
      onsetIdx = i - SLOPE_WINDOW;
    } else {
      // Slope died here — we've walked back into pre-launch noise
      break;
    }
  }
  return buf[onsetIdx].t;
}

export interface LaunchTelemetry {
  greenAt: number | null;        // for cross-checking; not always known here
  onsetTime: number;             // jerk-based onset (passed to RT)
  thresholdTime: number;         // first sample that crossed magnitude threshold
  confirmTime: number;           // sample where SUSTAINED_SAMPLES was reached
  peakG: number;                 // max linear-G observed in the buffer
  rewindMs: number;              // confirmTime - onsetTime
  sampleIntervalMean: number;    // observed mean ms between samples
  source: "native" | "js";       // which detection path produced this telemetry
}

interface UseAccelerometerOptions {
  armed: boolean;
  sensitivity: LaunchSensitivity;
  // candidateTime is the JERK-ONSET timestamp (rewound from the confirmation
  // sample), so RT reflects the start of acceleration — not the moment we
  // crossed threshold or the moment we confirmed.
  onLaunch: (candidateTime: number) => void;
  onRedLight: () => void;
  watchForRedLight: boolean;
  // Optional: receives full telemetry for the most recent launch.
  onLaunchTelemetry?: (t: LaunchTelemetry) => void;
}

export function useAccelerometer({
  armed,
  sensitivity,
  onLaunch,
  onRedLight,
  watchForRedLight,
  onLaunchTelemetry,
}: UseAccelerometerOptions) {
  const firedRef           = useRef(false);
  const sustainedRef       = useRef(0);
  const thresholdTimeRef   = useRef<number | null>(null);
  const sensorOffsetRef    = useRef<number | null>(null);
  const bufferRef          = useRef<Sample[]>([]);
  const lastSampleTRef     = useRef<number | null>(null);
  const intervalSumRef     = useRef(0);
  const intervalCountRef   = useRef(0);
  const peakMagRef         = useRef(0);
  const simTimerRef        = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Stable refs for the caller's callbacks. Updating refs is synchronous and
  // doesn't trigger a re-render, so the sensor subscription effect never needs
  // to tear down just because the parent re-rendered (which happens on every
  // sensor sample via setCurrentG). Without this, the sub would be removed and
  // re-created ~125×/s, creating tiny gaps in coverage during a real launch.
  const onLaunchRef          = useRef(onLaunch);
  const onRedLightRef        = useRef(onRedLight);
  const onLaunchTelemetryRef = useRef(onLaunchTelemetry);
  useEffect(() => { onLaunchRef.current = onLaunch; });
  useEffect(() => { onRedLightRef.current = onRedLight; });
  useEffect(() => { onLaunchTelemetryRef.current = onLaunchTelemetry; });

  const [currentG,    setCurrentG]    = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  const resetDetection = () => {
    firedRef.current         = false;
    sustainedRef.current     = 0;
    thresholdTimeRef.current = null;
    bufferRef.current        = [];
    lastSampleTRef.current   = null;
    intervalSumRef.current   = 0;
    intervalCountRef.current = 0;
    peakMagRef.current       = 0;
  };

  // Reset detection state on phase change. Sensor-clock offset stays
  // (it's a calibration that holds for the app session).
  useEffect(() => {
    resetDetection();
  }, [armed, watchForRedLight]);

  // Availability
  useEffect(() => {
    if (Platform.OS === "web") { setIsAvailable(false); return; }
    DeviceMotion.isAvailableAsync().then(setIsAvailable);
  }, []);

  // ── JS sensor subscription path (Android via expo-sensors DeviceMotion) ──
  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;

    if (!armed && !watchForRedLight) {
      setCurrentG(0);
      return;
    }

    DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

    const sub = DeviceMotion.addListener(({ acceleration, interval }) => {
      if (!acceleration) return;

      // ── Map sensor sample timestamp into performance.now() coordinates ──
      // This removes per-sample callback jitter (5–30 ms) from every reading.
      // Three-tier strategy:
      //   1. Best:   acceleration.timestamp (true hardware sample time)
      //   2. Better: perfNow - interval     (callback bias correction)
      //   3. Worst:  perfNow                (no correction; sanity fallback)
      const perfNow = performance.now();
      let sampleT = perfNow;
      const rawTs = (acceleration as { timestamp?: number }).timestamp;
      const haveSensorTs =
        rawTs != null && Number.isFinite(rawTs) && rawTs !== 0;
      if (haveSensorTs) {
        const tsMs = tsToMs(rawTs as number);
        if (sensorOffsetRef.current === null) {
          sensorOffsetRef.current = perfNow - tsMs;
        }
        sampleT = tsMs + sensorOffsetRef.current;
        // Sanity clamp: a sample can't be in the future and shouldn't be
        // older than ~200 ms. If the sensor clock is wonky, fall back.
        if (sampleT > perfNow || sampleT < perfNow - 200) {
          sampleT = perfNow - (interval ?? SAMPLE_INTERVAL_MS);
        }
      } else {
        // Sensor didn't expose a per-sample timestamp on this Expo SDK
        // build / device. Best estimate of when the sample was actually
        // taken: callback time minus the reported sample interval.
        // Removes a constant ≈ interval ms of bias even without sensor ts.
        const reported = interval ?? SAMPLE_INTERVAL_MS;
        sampleT = perfNow - Math.max(0, Math.min(reported, 50));
      }

      const mag = magnitude3(acceleration.x, acceleration.y, acceleration.z);
      setCurrentG(mag / 9.81);

      // Track observed sample interval (for diagnostic visibility)
      if (lastSampleTRef.current !== null) {
        const dt = sampleT - lastSampleTRef.current;
        if (dt > 0 && dt < 100) {
          intervalSumRef.current += dt;
          intervalCountRef.current += 1;
        }
      }
      lastSampleTRef.current = sampleT;

      // Push to rolling buffer (used for onset rewind)
      bufferRef.current.push({ t: sampleT, mag });
      if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift();
      if (mag > peakMagRef.current) peakMagRef.current = mag;

      if (firedRef.current) return;

      // ── Sustained-sample confirmation gate ──
      if (mag >= threshold) {
        if (sustainedRef.current === 0) {
          thresholdTimeRef.current = sampleT;
        }
        sustainedRef.current += 1;
        if (sustainedRef.current >= SUSTAINED_SAMPLES) {
          firedRef.current = true;
          // Walk back through the buffer to find the jerk-onset timestamp
          const onsetT = findOnsetTimestamp(bufferRef.current, sampleT);
          const meanInt = intervalCountRef.current > 0
            ? intervalSumRef.current / intervalCountRef.current
            : SAMPLE_INTERVAL_MS;
          if (onLaunchTelemetryRef.current) {
            onLaunchTelemetryRef.current({
              greenAt: null,
              onsetTime: onsetT,
              thresholdTime: thresholdTimeRef.current ?? sampleT,
              confirmTime: sampleT,
              peakG: peakMagRef.current / 9.81,
              rewindMs: sampleT - onsetT,
              sampleIntervalMean: meanInt,
              source: "js",
            });
          }
          if (armed)                 { onLaunchRef.current(onsetT); }
          else if (watchForRedLight) { onRedLightRef.current(); }
        }
      } else {
        sustainedRef.current     = 0;
        thresholdTimeRef.current = null;
      }
    });

    return () => sub.remove();
  // Callbacks intentionally omitted — they're read via refs so the
  // subscription never tears down just because the parent re-rendered.
  }, [isAvailable, armed, watchForRedLight, sensitivity]);

  // ── Web / simulator ───────────────────────────────────────────────────────
  const clearSimTimers = () => {
    simTimerRef.current.forEach(clearTimeout);
    simTimerRef.current = [];
  };

  const runSimulation = useCallback((callback: () => void) => {
    clearSimTimers();
    if (firedRef.current) return;

    const steps = [0.1, 0.25, 0.5, 0.8, 1.2, 1.6, 2.0];
    steps.forEach((g, i) => {
      const t = setTimeout(() => setCurrentG(g), i * 16);
      simTimerRef.current.push(t);
    });

    const fireT = setTimeout(() => {
      firedRef.current = true;
      callback();
      const decay = [1.4, 1.0, 0.6, 0.3, 0.1, 0];
      decay.forEach((g, i) => {
        const d = setTimeout(() => setCurrentG(g), i * 40);
        simTimerRef.current.push(d);
      });
    }, steps.length * 16 + 10);
    simTimerRef.current.push(fireT);
  }, []);

  const simulateLaunch = useCallback(() => {
    if (!armed) return;
    runSimulation(() => onLaunch(performance.now()));
  }, [armed, runSimulation, onLaunch]);

  const simulateRedLight = useCallback(() => {
    if (!watchForRedLight) return;
    runSimulation(onRedLight);
  }, [watchForRedLight, runSimulation, onRedLight]);

  useEffect(() => () => clearSimTimers(), []);

  return { currentG, isAvailable, simulateLaunch, simulateRedLight };
}
