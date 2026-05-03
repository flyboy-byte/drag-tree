// Tiny in-memory pub/sub for user preferences.
// Mirrors the launchTelemetry pattern so the home screen and the settings
// screen can both read/write the same flags without a context provider.

export interface AppSettings {
  practiceMode: boolean;
  // Set by the home screen while a run is in progress; the settings screen
  // uses this to lock toggles that would corrupt an active session.
  sessionLocked: boolean;
}

let current: AppSettings = {
  practiceMode: false,
  sessionLocked: false,
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
