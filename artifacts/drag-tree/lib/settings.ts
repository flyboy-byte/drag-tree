// Tiny in-memory pub/sub for user preferences.
// Mirrors the launchTelemetry pattern so the home screen and the settings
// screen can both read/write the same flags without a context provider.

export interface AppSettings {
  // Show an on-screen FLOOR IT / RED LIGHT button on the home screen.
  showFloorIt: boolean;
  // Custom launch-detection threshold in m/s². Only used when
  // sensitivity is set to "custom" on the home screen.
  customThreshold: number;
  // Arm the motion sensor for launch detection.
  // When false, sensor is subscribed but never fires — taps take over.
  sensorEnabled: boolean;
  // Set by the home screen while a run is in progress; the settings screen
  // uses this to lock toggles that would corrupt an active session.
  sessionLocked: boolean;
  // "pro" = Pro Tree (.400s, all ambers together)
  // "full" = Sportsman Tree (.500s, ambers count down one at a time)
  treeMode: "pro" | "full";
}

let current: AppSettings = {
  showFloorIt: false,
  customThreshold: 2.0,
  sensorEnabled: true,
  sessionLocked: false,
  treeMode: "pro",
};

const listeners = new Set<() => void>();

export const settings = {
  get(): AppSettings {
    return current;
  },
  set(patch: Partial<AppSettings>): void {
    current = { ...current, ...patch };
    listeners.forEach(fn => fn());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
