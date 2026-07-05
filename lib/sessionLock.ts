// Minimal pub/sub for the session-locked flag.
// Kept separate from the settings store so that phase transitions on the
// home screen (which write sessionLocked) don't trigger a settings
// re-render on the home screen — the home screen never reads this value.

let locked = false;
const listeners = new Set<() => void>();

export const sessionLock = {
  get(): boolean {
    return locked;
  },
  set(v: boolean): void {
    if (locked === v) return;
    locked = v;
    listeners.forEach(fn => fn());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
