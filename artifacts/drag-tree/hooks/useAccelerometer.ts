import { useEffect, useRef, useCallback, useState } from "react";
import { Accelerometer } from "expo-sensors";
import { Platform } from "react-native";

export type LaunchSensitivity = "gentle" | "normal" | "hard";

// Thresholds in m/s² (sustained delta above resting baseline).
//
// These are deliberately low compared to naive single-sample approaches
// because we pair them with a sustained-sample confirmation (see below).
// A real launch holds above threshold for 300–500 ms.
// A road bump or tap spike is over in < 30 ms.
//
//   gentle ~0.15g — FWD street car, light throttle, smooth pavement
//   normal ~0.25g — RWD or sport car, moderate launch
//   hard   ~0.46g — drag-prepped, slicks, hard launch
const SENSITIVITY_THRESHOLDS: Record<LaunchSensitivity, number> = {
  gentle: 1.5,
  normal: 2.5,
  hard:   4.5,
};

// How many consecutive above-threshold readings are required before firing.
// At a 16 ms poll interval, 3 samples = ~48 ms of sustained G-force.
// This rejects single-sample spikes (bumps, taps, vibration) while still
// catching any real launch well within the first 100 ms of movement.
const SUSTAINED_SAMPLES = 3;

// Number of idle samples to average for a stable baseline.
// At 100 ms interval this covers the last 800 ms of "rest".
const BASELINE_WINDOW = 8;

function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

interface UseAccelerometerOptions {
  armed: boolean;
  sensitivity: LaunchSensitivity;
  onLaunch: () => void;
  onRedLight: () => void;
  watchForRedLight: boolean;
}

export function useAccelerometer({
  armed,
  sensitivity,
  onLaunch,
  onRedLight,
  watchForRedLight,
}: UseAccelerometerOptions) {
  // Stable rolling-average baseline built during idle.
  // NOT reset on arm — carries forward the phone's resting state
  // at the moment the driver taps STAGE.
  const baselineMagRef   = useRef<number | null>(null);
  const idleSamplesRef   = useRef<number[]>([]);
  const firedRef         = useRef(false);
  // Counts consecutive readings above threshold; resets on any dip below.
  const sustainedRef     = useRef(0);
  const simTimerRef      = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [currentG,    setCurrentG]    = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  // Reset fire-gate and sustained counter when phase changes.
  // Baseline stays intact — already reflects resting state.
  useEffect(() => {
    firedRef.current   = false;
    sustainedRef.current = 0;
  }, [armed, watchForRedLight]);

  // Sensor availability check (native only — web is always false)
  useEffect(() => {
    if (Platform.OS === "web") { setIsAvailable(false); return; }
    Accelerometer.isAvailableAsync().then(setIsAvailable);
  }, []);

  // ── Real sensor subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;

    // ── IDLE: build rolling-average baseline ────────────────────────────────
    if (!armed && !watchForRedLight) {
      idleSamplesRef.current = [];
      Accelerometer.setUpdateInterval(100);

      const sub = Accelerometer.addListener(({ x, y, z }) => {
        const mag = magnitude(x, y, z);

        idleSamplesRef.current.push(mag);
        if (idleSamplesRef.current.length > BASELINE_WINDOW) {
          idleSamplesRef.current.shift();
        }

        // Rolling average = stable baseline, ignores single-sample jitter
        const avg =
          idleSamplesRef.current.reduce((a, b) => a + b, 0) /
          idleSamplesRef.current.length;
        baselineMagRef.current = avg;
        setCurrentG(0);
      });

      return () => sub.remove();
    }

    // ── ARMED / RED-LIGHT WATCH ─────────────────────────────────────────────
    Accelerometer.setUpdateInterval(16);
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag = magnitude(x, y, z);

      // Edge case: idle phase was skipped — seed baseline from first reading
      if (baselineMagRef.current === null) {
        baselineMagRef.current = mag;
        return;
      }

      const delta = Math.max(0, mag - baselineMagRef.current);

      // Always update the G-meter display
      setCurrentG(delta / 9.81);

      if (firedRef.current) return;

      // ── Sustained-sample confirmation ──────────────────────────────────
      // Increment counter while above threshold; reset on any dip.
      // Fires only when SUSTAINED_SAMPLES consecutive readings all exceed
      // the threshold — eliminates bumps/taps that spike then drop.
      if (delta >= threshold) {
        sustainedRef.current += 1;
        if (sustainedRef.current >= SUSTAINED_SAMPLES) {
          firedRef.current = true;
          if (armed)                 { onLaunch(); }
          else if (watchForRedLight) { onRedLight(); }
        }
      } else {
        sustainedRef.current = 0;
      }
    });

    return () => sub.remove();
  }, [isAvailable, armed, watchForRedLight, sensitivity, onLaunch, onRedLight]);

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
    runSimulation(onLaunch);
  }, [armed, runSimulation, onLaunch]);

  const simulateRedLight = useCallback(() => {
    if (!watchForRedLight) return;
    runSimulation(onRedLight);
  }, [watchForRedLight, runSimulation, onRedLight]);

  useEffect(() => () => clearSimTimers(), []);

  return { currentG, isAvailable, simulateLaunch, simulateRedLight };
}
