// Tiny in-memory pub/sub for the most-recent real-session launch telemetry.
// useAccelerometer fires raw sensor telemetry; the home screen combines it
// with greenAt from useTreeSession and writes the merged record here.
// The Diagnostics screen subscribes via useSyncExternalStore.

import type { MotionKind } from "./motionSource";

export interface RealLaunchTelemetry {
  capturedAt: number;            // performance.now() when written
  greenAt: number | null;        // performance.now() of vsync after green lit
  onsetTime: number;             // jerk-onset (passed to RT calc)
  thresholdTime: number;         // first sample over magnitude threshold
  confirmTime: number;           // sample where the sustain gate was met
  peakG: number;
  sampleIntervalMean: number;
  // Derived
  greenToOnsetMs: number | null;     // = onsetTime - greenAt (the actual RT)
  onsetToThresholdMs: number;        // = thresholdTime - onsetTime
  thresholdToConfirmMs: number;      // = confirmTime - thresholdTime
  rewindMs: number;                  // = confirmTime - onsetTime
  source: MotionKind;                // sensor: "linear" (Android fusion) or "accel" (gravity filtered in-app)
}

let current: RealLaunchTelemetry | null = null;
const listeners = new Set<() => void>();

export const launchTelemetry = {
  get(): RealLaunchTelemetry | null {
    return current;
  },
  set(t: RealLaunchTelemetry): void {
    current = t;
    listeners.forEach(fn => fn());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
