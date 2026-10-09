// Hardware launch buttons (PLAN.md idea 4b).
//
// Android: volume up/down, a wired headphone button, or a Bluetooth camera
// shutter remote (they send volume-up or Enter), via the local native module
// modules/dragtree-input. While subscribed those keys are consumed, so the
// volume doesn't change. Web: Space or Enter on a keyboard.
//
// Each press is reported as down/up with the key's own event time mapped
// onto performance.now(), so a release is timed to the hardware event, not
// to when JS got around to handling it.

import { Platform } from "react-native";
import { DragTreeInput } from "@/modules/dragtree-input";
import { createClockMap } from "./motionSource";

export type KeyHandler = (e: { down: boolean; at: number }) => void;

export interface HardwareKeySource {
  kind: "android" | "keyboard";
  // Start listening; returns an unsubscribe function.
  subscribe(handler: KeyHandler): () => void;
}

const androidSource: HardwareKeySource | null = DragTreeInput
  ? {
      kind: "android",
      subscribe(handler) {
        const native = DragTreeInput!;
        const a = performance.now();
        const dev = native.uptimeNowMs();
        const b = performance.now();
        const clock = createClockMap((a + b) / 2 - dev);
        const sub = native.addListener("onKey", e => {
          handler({ down: e.down, at: clock.map(e.t, performance.now()) });
        });
        void native.setKeyCapture(true);
        return () => {
          sub.remove();
          void native.setKeyCapture(false);
        };
      },
    }
  : null;

const keyboardSource: HardwareKeySource = {
  kind: "keyboard",
  subscribe(handler) {
    const isLaunchKey = (e: KeyboardEvent) => e.code === "Space" || e.key === "Enter";
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onDown = (e: KeyboardEvent) => {
      if (!isLaunchKey(e) || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) handler({ down: true, at: e.timeStamp });
    };
    const onUp = (e: KeyboardEvent) => {
      if (!isLaunchKey(e) || typing(e)) return;
      e.preventDefault();
      handler({ down: false, at: e.timeStamp });
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  },
};

export function getHardwareKeySource(): HardwareKeySource | null {
  if (Platform.OS === "web") return typeof window !== "undefined" ? keyboardSource : null;
  if (Platform.OS === "android") return androidSource;
  return null;
}
