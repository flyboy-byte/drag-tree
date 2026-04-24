import { useEffect, useRef, useCallback, useState } from "react";
import { Accelerometer } from "expo-sensors";
import { Platform } from "react-native";

export type LaunchSensitivity = "gentle" | "normal" | "hard";

// Thresholds in m/s² (delta above baseline)
// gentle=~0.3g  normal=~0.56g  hard=~0.92g
const SENSITIVITY_THRESHOLDS: Record<LaunchSensitivity, number> = {
  gentle: 3.0,
  normal: 5.5,
  hard:   9.0,
};

// Number of idle samples to average for a stable baseline.
// At 100ms interval this covers the last 800ms of "rest".
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
  // NOT reset on arm — we intentionally carry it forward so the
  // phone's true resting state at time of staging is used.
  const baselineMagRef  = useRef<number | null>(null);
  const idleSamplesRef  = useRef<number[]>([]);
  const firedRef        = useRef(false);
  const simTimerRef     = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [currentG,    setCurrentG]    = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  // Only reset the fire-gate when the active phase changes.
  // Baseline stays intact — it was built during idle and reflects
  // the phone's resting position at the moment of staging.
  useEffect(() => {
    firedRef.current = false;
  }, [armed, watchForRedLight]);

  // Sensor availability check (native only — web always false)
  useEffect(() => {
    if (Platform.OS === "web") { setIsAvailable(false); return; }
    Accelerometer.isAvailableAsync().then(setIsAvailable);
  }, []);

  // ── Real sensor subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;

    // ── IDLE: build a rolling-average baseline ──────────────────────────────
    if (!armed && !watchForRedLight) {
      idleSamplesRef.current = [];
      Accelerometer.setUpdateInterval(100);

      const sub = Accelerometer.addListener(({ x, y, z }) => {
        const mag = magnitude(x, y, z);

        // Maintain a rolling window
        idleSamplesRef.current.push(mag);
        if (idleSamplesRef.current.length > BASELINE_WINDOW) {
          idleSamplesRef.current.shift();
        }

        // Average = stable baseline, immune to single-sample road bumps
        const avg =
          idleSamplesRef.current.reduce((a, b) => a + b, 0) /
          idleSamplesRef.current.length;
        baselineMagRef.current = avg;
        setCurrentG(0);
      });

      return () => sub.remove();
    }

    // ── ARMED / RED-LIGHT WATCH ─────────────────────────────────────────────
    // Run at full rate for responsive detection
    Accelerometer.setUpdateInterval(16);
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag = magnitude(x, y, z);

      // Fallback: if idle phase was skipped (edge case), seed baseline here
      if (baselineMagRef.current === null) {
        baselineMagRef.current = mag;
        return;
      }

      // Always update G display
      const delta = Math.max(0, mag - baselineMagRef.current);
      setCurrentG(delta / 9.81);

      // Check threshold only once per arm cycle
      if (!firedRef.current && delta >= threshold) {
        firedRef.current = true;
        if (armed)              { onLaunch(); }
        else if (watchForRedLight) { onRedLight(); }
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
