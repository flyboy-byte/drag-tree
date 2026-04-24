import { useEffect, useRef, useCallback, useState } from "react";
import { Accelerometer } from "expo-sensors";
import { Platform } from "react-native";

export type LaunchSensitivity = "gentle" | "normal" | "hard";

// Threshold in m/s² above baseline to trigger a launch
const SENSITIVITY_THRESHOLDS: Record<LaunchSensitivity, number> = {
  gentle: 3.0,  // ~0.3g — stock car, soft launch
  normal: 5.5,  // ~0.56g — spirited street car
  hard: 9.0,    // ~0.92g — race prep / drag car
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
  const firedRef = useRef(false);
  const [currentG, setCurrentG] = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);

  // Check availability
  useEffect(() => {
    if (Platform.OS === "web") {
      setIsAvailable(false);
      return;
    }
    Accelerometer.isAvailableAsync().then(setIsAvailable);
  }, []);

  // Calibrate baseline when armed state changes to watching
  const calibrate = useCallback(() => {
    baselineMagRef.current = null;
    firedRef.current = false;
  }, []);

  useEffect(() => {
    if (!isAvailable || Platform.OS === "web") return;
    if (!armed && !watchForRedLight) {
      // Set a slow update rate when idle to save battery
      Accelerometer.setUpdateInterval(200);
      const sub = Accelerometer.addListener(({ x, y, z }) => {
        const mag = magnitude(x, y, z);
        // Update baseline continuously when not active
        baselineMagRef.current = mag;
        setCurrentG(0);
      });
      return () => sub.remove();
    }

    // Fast update rate during active sequence
    Accelerometer.setUpdateInterval(16); // ~60fps

    const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag = magnitude(x, y, z);

      // Update live G reading (delta from gravity baseline)
      if (baselineMagRef.current !== null) {
        const delta = Math.max(0, mag - baselineMagRef.current);
        setCurrentG(delta / 9.81);
      }

      // First sample after arming: set baseline
      if (baselineMagRef.current === null) {
        baselineMagRef.current = mag;
        return;
      }

      if (firedRef.current) return;

      const delta = mag - baselineMagRef.current;

      if (delta >= threshold) {
        firedRef.current = true;
        if (armed) {
          onLaunch();
        } else if (watchForRedLight) {
          onRedLight();
        }
      }
    });

    return () => sub.remove();
  }, [isAvailable, armed, watchForRedLight, sensitivity, onLaunch, onRedLight]);

  return { currentG, isAvailable, calibrate };
}
