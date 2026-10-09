// JS binding for the DragTree native input module (Android only).
// Returns null on web, iOS, or any build without the module, so callers can
// fall back to expo-sensors / the on-screen button.

import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

export type MotionKind = "linear" | "accel" | "none";

export interface NativeMotionSample { x: number; y: number; z: number; t: number } // m/s², elapsedRealtime ms
export interface NativeKeyEvent { down: boolean; keyCode: number; t: number }      // uptime ms

interface DragTreeInputNative {
  motionKind(): MotionKind;
  elapsedNowMs(): number;
  uptimeNowMs(): number;
  startMotion(): MotionKind;
  stopMotion(): void;
  setKeyCapture(enabled: boolean): Promise<void>;
  addListener(event: "onMotion", fn: (s: NativeMotionSample) => void): EventSubscription;
  addListener(event: "onKey", fn: (e: NativeKeyEvent) => void): EventSubscription;
}

export const DragTreeInput = requireOptionalNativeModule<DragTreeInputNative>("DragTreeInput");
