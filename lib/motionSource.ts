// One motion stream for the whole app: linear-acceleration magnitude (m/s²)
// with each sample's hardware time mapped onto performance.now().
//
// Sources, best first:
//   1. Native module, TYPE_LINEAR_ACCELERATION  (~200 Hz, gravity removed by Android)
//   2. Native module, TYPE_ACCELEROMETER        (~200 Hz, gravity filtered here)
//   3. expo-sensors Accelerometer               (builds without the native module)
// expo-sensors' DeviceMotion is not used: on Android it dispatches once per
// display frame, which capped sampling at ~60 Hz.
//
// The stream is shared and ref-counted — the sensor runs while anyone is
// subscribed and stops when the last one leaves.

import { Platform } from "react-native";
import { Accelerometer } from "expo-sensors";
import { DragTreeInput } from "@/modules/dragtree-input";
import { createGravityFilter } from "./gravity";
import type { MotionSample } from "./launchDetector";

export type MotionKind = "linear" | "accel" | "none";

// ── Clock mapping ──────────────────────────────────────────────────────────
// Device event times use a different clock than performance.now(). With a
// directly measured offset we trust it while it stays plausible; otherwise
// (or if it ever looks wrong) fall back to the running minimum of
// (arrival − event time), which converges on the true offset plus the
// smallest delivery delay seen.
export interface ClockMap { map(t: number, perfNow: number): number }

export function createClockMap(measuredOffset: number | null): ClockMap {
  let trusted = measuredOffset !== null;
  let minOffset = Infinity;
  return {
    map(t, perfNow) {
      minOffset = Math.min(minOffset, perfNow - t);
      if (trusted && measuredOffset !== null) {
        const lag = perfNow - (t + measuredOffset);
        if (lag >= -5 && lag <= 250) return Math.min(t + measuredOffset, perfNow);
        trusted = false;
      }
      return t + minOffset;
    },
  };
}

// ── Availability ───────────────────────────────────────────────────────────
export async function getMotionKind(): Promise<MotionKind> {
  if (Platform.OS === "web") return "none";
  if (DragTreeInput) return DragTreeInput.motionKind();
  const ok = await Accelerometer.isAvailableAsync().catch(() => false);
  return ok ? "accel" : "none";
}

// ── Shared stream ──────────────────────────────────────────────────────────
type Listener = (s: MotionSample) => void;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;
let activeKind: MotionKind = "none";

function start(): void {
  const gravity = createGravityFilter();
  const emit = (s: MotionSample) => listeners.forEach(fn => fn(s));

  if (DragTreeInput) {
    const native = DragTreeInput;
    // Measure the clock offset a few times and keep the tightest bracket.
    let best = Infinity, offset = 0;
    for (let i = 0; i < 3; i++) {
      const a = performance.now();
      const dev = native.elapsedNowMs();
      const b = performance.now();
      if (b - a < best) { best = b - a; offset = (a + b) / 2 - dev; }
    }
    const clock = createClockMap(offset);
    const kind = native.motionKind();
    const sub = native.addListener("onMotion", ({ x, y, z, t }) => {
      const mag = kind === "linear" ? Math.sqrt(x * x + y * y + z * z) : gravity.push(x, y, z, t);
      emit({ t: clock.map(t, performance.now()), mag });
    });
    activeKind = native.startMotion();
    stop = () => { sub.remove(); native.stopMotion(); };
    return;
  }

  // Fallback: expo-sensors Accelerometer reports g (gravity included) with
  // a timestamp in seconds.
  const clock = createClockMap(null);
  Accelerometer.setUpdateInterval(5);
  const sub = Accelerometer.addListener(r => {
    const t = (r as { timestamp?: number }).timestamp;
    const tMs = typeof t === "number" && Number.isFinite(t) && t > 0 ? t * 1000 : performance.now();
    const mag = gravity.push(r.x * 9.81, r.y * 9.81, r.z * 9.81, tMs);
    emit({ t: clock.map(tMs, performance.now()), mag });
  });
  activeKind = "accel";
  stop = () => sub.remove();
}

/** Subscribe to the shared motion stream. Returns an unsubscribe function. */
export function subscribeMotion(fn: Listener): () => void {
  if (Platform.OS === "web") return () => {};
  listeners.add(fn);
  if (!stop) start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && stop) { stop(); stop = null; activeKind = "none"; }
  };
}

/** Which sensor the running stream uses ("none" when nothing is subscribed). */
export function activeMotionKind(): MotionKind {
  return activeKind;
}
