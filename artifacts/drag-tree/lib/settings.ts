// Tiny pub/sub store for user preferences.
// Mirrors the launchTelemetry pattern so the home screen and the settings
// screen can both read/write the same flags without a context provider.
// Persistent fields are saved to AsyncStorage and reloaded on next launch.

import AsyncStorage from "@react-native-async-storage/async-storage";

export type SensitivityKey = "gentle" | "normal" | "hard" | "custom";

export interface AppSettings {
  // Show an on-screen FLOOR IT / RED LIGHT button on the home screen.
  showFloorIt: boolean;
  // Which sensitivity preset is active. "custom" uses customThreshold below.
  sensitivity: SensitivityKey;
  // Custom launch-detection threshold in m/s². Only used when sensitivity === "custom".
  customThreshold: number;
  // Arm the motion sensor for launch detection.
  // When false, sensor is subscribed but never fires — taps take over.
  sensorEnabled: boolean;
  // "pro" = Pro Tree (.400s, all ambers together)
  // "full" = Sportsman Tree (.500s, ambers count down one at a time)
  treeMode: "pro" | "full";
}

// Fields written to AsyncStorage on every change.
const STORAGE_KEY = "dragtree.settings.v1";
const VALID_SENSITIVITY: SensitivityKey[] = ["gentle", "normal", "hard", "custom"];

let current: AppSettings = {
  showFloorIt: false,
  sensitivity: "normal",
  customThreshold: 2.0,
  sensorEnabled: true,
  treeMode: "pro",
};

const listeners = new Set<() => void>();

// Load persisted preferences on module init.
// Runs once asynchronously; notifies subscribers when the patch is applied
// so the UI picks up the saved values on first render (typically < 10 ms).
(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved: Partial<AppSettings> = JSON.parse(raw);
    const patch: Partial<AppSettings> = {};

    if (typeof saved.showFloorIt === "boolean")
      patch.showFloorIt = saved.showFloorIt;

    if (typeof saved.sensitivity === "string" && (VALID_SENSITIVITY as string[]).includes(saved.sensitivity))
      patch.sensitivity = saved.sensitivity as SensitivityKey;

    if (typeof saved.customThreshold === "number" && Number.isFinite(saved.customThreshold))
      patch.customThreshold = Math.max(0.8, Math.min(6.0, saved.customThreshold));

    if (typeof saved.sensorEnabled === "boolean")
      patch.sensorEnabled = saved.sensorEnabled;

    if (saved.treeMode === "pro" || saved.treeMode === "full")
      patch.treeMode = saved.treeMode;

    if (Object.keys(patch).length > 0) {
      current = { ...current, ...patch };
      listeners.forEach(fn => fn());
    }
  } catch {
    // Storage unavailable — proceed with defaults, no user-facing error.
  }
})();

// Debounced write — coalesces rapid stepper taps into a single I/O call.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const { showFloorIt, sensitivity, customThreshold, sensorEnabled, treeMode } = current;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showFloorIt, sensitivity, customThreshold, sensorEnabled, treeMode }),
    ).catch(() => {});
  }, 250);
}

export const settings = {
  get(): AppSettings {
    return current;
  },
  set(patch: Partial<AppSettings>): void {
    current = { ...current, ...patch };
    listeners.forEach(fn => fn());
    persist();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
