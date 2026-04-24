import { useEffect, useRef, useCallback, useState } from "react";
import { Accelerometer } from "expo-sensors";
import { Platform } from "react-native";

export type LaunchSensitivity = "gentle" | "normal" | "hard";

const SENSITIVITY_THRESHOLDS: Record<LaunchSensitivity, number> = {
  gentle: 3.0,
  normal: 5.5,
  hard:   9.0,
};

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
  const baselineMagRef = useRef<number | null>(null);
  const firedRef       = useRef(false);
  const simTimerRef    = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [currentG,    setCurrentG]    = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  // Reset fire-gate whenever armed/watchForRedLight changes
  useEffect(() => {
    firedRef.current = false;
    baselineMagRef.current = null;
  }, [armed, watchForRedLight]);

  // Check real sensor availability (native only)
  useEffect(() => {
    if (Platform.OS === "web") { setIsAvailable(false); return; }
    Accelerometer.isAvailableAsync().then(setIsAvailable);
  }, []);

  // ── Real sensor subscription (native) ──────────────────────────────────
  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;

    if (!armed && !watchForRedLight) {
      Accelerometer.setUpdateInterval(200);
      const sub = Accelerometer.addListener(({ x, y, z }) => {
        baselineMagRef.current = magnitude(x, y, z);
        setCurrentG(0);
      });
      return () => sub.remove();
    }

    Accelerometer.setUpdateInterval(16);
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag = magnitude(x, y, z);

      if (baselineMagRef.current !== null) {
        const delta = Math.max(0, mag - baselineMagRef.current);
        setCurrentG(delta / 9.81);
      }

      if (baselineMagRef.current === null) {
        baselineMagRef.current = mag;
        return;
      }

      if (firedRef.current) return;

      const delta = mag - baselineMagRef.current;
      if (delta >= threshold) {
        firedRef.current = true;
        if (armed) { onLaunch(); }
        else if (watchForRedLight) { onRedLight(); }
      }
    });

    return () => sub.remove();
  }, [isAvailable, armed, watchForRedLight, sensitivity, onLaunch, onRedLight]);

  // ── Web simulation ──────────────────────────────────────────────────────
  const clearSimTimers = () => {
    simTimerRef.current.forEach(clearTimeout);
    simTimerRef.current = [];
  };

  // Animate G-meter up then fire the callback
  const runSimulation = useCallback((callback: () => void) => {
    clearSimTimers();
    if (firedRef.current) return;

    // Ramp up G reading over ~100ms in steps, then fire
    const steps = [0.1, 0.25, 0.5, 0.8, 1.2, 1.6, 2.0];
    steps.forEach((g, i) => {
      const t = setTimeout(() => setCurrentG(g), i * 16);
      simTimerRef.current.push(t);
    });

    // Fire at the peak
    const fireT = setTimeout(() => {
      firedRef.current = true;
      callback();
      // Decay back to 0
      const decaySteps = [1.4, 1.0, 0.6, 0.3, 0.1, 0];
      decaySteps.forEach((g, i) => {
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

  // Cleanup on unmount
  useEffect(() => () => clearSimTimers(), []);

  return { currentG, isAvailable, simulateLaunch, simulateRedLight };
}
