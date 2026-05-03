// Tiny in-memory pub/sub for user preferences.
// Mirrors the launchTelemetry pattern so the home screen and the settings
// screen can both read/write the same flags without a context provider.

export interface AppSettings {
  practiceMode: boolean;
}

let current: AppSettings = {
  practiceMode: false,
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
