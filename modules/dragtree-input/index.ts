// JS binding for the DragTree native input module (Android only).
// Returns null on web, iOS, or any build without the module, so callers can
// fall back to expo-sensors / the on-screen button.

import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

export type MotionKind = "linear" | "accel" | "none";

export interface NativeMotionSample { x: number; y: number; z: number; t: number; kind?: MotionKind } // m/s², elapsedRealtime ms
export interface NativeSensorInfo { name: string; vendor: string; maxHz: number } // maxHz 0 = not stated
export interface NativeMotionInfo { linear: NativeSensorInfo | null; accel: NativeSensorInfo | null; linearTooSlow: boolean }
export interface NativeKeyEvent { down: boolean; keyCode: number; t: number }      // uptime ms

interface DragTreeInputNative {
  motionKind(): MotionKind;
  elapsedNowMs(): number;
  uptimeNowMs(): number;
  startMotion(): MotionKind;
  stopMotion(): void;
  activeMotionKind?(): MotionKind;
  motionInfo?(): NativeMotionInfo;
  setKeyCapture(enabled: boolean): Promise<void>;
  loadCues?(cues: Record<string, string>): Promise<void>; // key → base64 WAV
  playCue?(key: string): boolean;
  addListener(event: "onMotion", fn: (s: NativeMotionSample) => void): EventSubscription;
  addListener(event: "onKey", fn: (e: NativeKeyEvent) => void): EventSubscription;
}

export const DragTreeInput = requireOptionalNativeModule<DragTreeInputNative>("DragTreeInput");
