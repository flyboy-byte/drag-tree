import { useEffect, useRef, useCallback, useState } from "react";
import { DeviceMotion } from "expo-sensors";
import { Platform } from "react-native";

export type LaunchSensitivity = "gentle" | "normal" | "hard";

// Thresholds in m/s² of TRUE LINEAR ACCELERATION (gravity already removed
// by Android's sensor fusion). With DeviceMotion these values now mean
// exactly what they say — a 0.25g launch produces ~2.45 m/s² magnitude
// regardless of how the phone is oriented.
//
//   gentle ~0.15g — FWD street car, light throttle
//   normal ~0.25g — RWD or sport car, moderate launch
//   hard   ~0.46g — drag-prepped, slicks, hard launch
const SENSITIVITY_THRESHOLDS: Record<LaunchSensitivity, number> = {
  gentle: 1.5,
  normal: 2.5,
  hard:   4.5,
};

// Sustained confirmation: 3 samples at 16 ms = ~48 ms of held G-force.
// A real launch holds 300–500 ms; a single bump or vibration spike
// is over in < 30 ms and gets rejected.
const SUSTAINED_SAMPLES = 3;

function magnitude3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

interface UseAccelerometerOptions {
  armed: boolean;
  sensitivity: LaunchSensitivity;
  // candidateTime is performance.now() of the FIRST threshold-crossing
  // sample, so RT reflects first detected movement (not confirmation time).
  onLaunch: (candidateTime: number) => void;
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
  const firedRef         = useRef(false);
  const sustainedRef     = useRef(0);
  const candidateTimeRef = useRef<number | null>(null);
  const simTimerRef      = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [currentG,    setCurrentG]    = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  // Reset detection state on phase change
  useEffect(() => {
    firedRef.current         = false;
    sustainedRef.current     = 0;
    candidateTimeRef.current = null;
  }, [armed, watchForRedLight]);

  // DeviceMotion availability (native only)
  useEffect(() => {
    if (Platform.OS === "web") { setIsAvailable(false); return; }
    DeviceMotion.isAvailableAsync().then(setIsAvailable);
  }, []);

  // ── Sensor subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;

    // Idle: no detection needed, just zero the display
    if (!armed && !watchForRedLight) {
      setCurrentG(0);
      return;
    }

    // Armed / red-light watch: full-rate detection
    DeviceMotion.setUpdateInterval(16);
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

    const sub = DeviceMotion.addListener(({ acceleration }) => {
      // acceleration is gravity-REMOVED linear acceleration in m/s²
      // (computed by Android's sensor fusion using accelerometer + gyro)
      if (!acceleration) return;

      const mag = magnitude3(acceleration.x, acceleration.y, acceleration.z);

      // Display in g-force units for the UI meter
      setCurrentG(mag / 9.81);

      if (firedRef.current) return;

      // ── Sustained-sample confirmation ─────────────────────────────────
      // First crossing: record candidate timestamp.
      // 3 consecutive readings above threshold: confirm and fire with
      //   the FIRST timestamp (so RT isn't shifted by ~48 ms).
      // Any dip below: discard candidate, reset counter.
      if (mag >= threshold) {
        if (sustainedRef.current === 0) {
          candidateTimeRef.current = performance.now();
        }
        sustainedRef.current += 1;
        if (sustainedRef.current >= SUSTAINED_SAMPLES) {
          firedRef.current = true;
          const t = candidateTimeRef.current!;
          if (armed)                 { onLaunch(t); }
          else if (watchForRedLight) { onRedLight(); }
        }
      } else {
        sustainedRef.current     = 0;
        candidateTimeRef.current = null;
      }
    });

    return () => sub.remove();
  }, [isAvailable, armed, watchForRedLight, sensitivity, onLaunch, onRedLight]);

  // ── Web / simulator (unchanged) ───────────────────────────────────────────
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
