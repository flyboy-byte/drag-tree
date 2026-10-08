// Time-slip calibration (PLAN.md idea 3).
// Pairs the app's RT with the RT printed on a real time slip and reports the
// average offset. Stored under its own key so run history (dragtree.history.v1)
// doesn't need a migration.
//
// Track RT starts at the stage beam, the app at acceleration onset — the
// offset depends on the car and staging depth. That's why we calibrate
// instead of promising a match.

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface SlipPair {
  id: string;
  appRT: number;   // seconds, from the app
  slipRT: number;  // seconds, from the time slip
  at: number;      // Date.now() when entered
}

const STORAGE_KEY = "dragtree.slipCal.v1";
const MAX_PAIRS = 50;

// ── Pure helpers ────────────────────────────────────────────────────────────

// Positive offset = slip reads slower than the app.
export function averageOffset(pairs: SlipPair[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.reduce((s, p) => s + (p.slipRT - p.appRT), 0) / pairs.length;
}

export function applyOffset(rt: number, offset: number | null): number {
  return offset === null ? rt : rt + offset;
}

// Plausible slip RT: red lights show negative on a slip; > 2 s is a typo.
export function isValidSlipRT(v: number): boolean {
  return Number.isFinite(v) && v > -1 && v < 2;
}

// ── Pub/sub store (same pattern as lib/settings.ts) ──────────────────────────

let pairs: SlipPair[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved)) {
      pairs = saved.filter(
        (p): p is SlipPair =>
          p && typeof p.id === "string" &&
          typeof p.appRT === "number" && typeof p.slipRT === "number" &&
          typeof p.at === "number",
      );
      notify();
    }
  } catch {
    // Storage unavailable — start empty.
  }
})();

function persist(): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pairs)).catch(() => {});
}

export const slipCalibration = {
  get(): SlipPair[] {
    return pairs;
  },
  add(appRT: number, slipRT: number): void {
    if (!isValidSlipRT(slipRT)) return;
    const pair: SlipPair = { id: `${Date.now()}`, appRT, slipRT, at: Date.now() };
    pairs = [pair, ...pairs].slice(0, MAX_PAIRS);
    notify();
    persist();
  },
  remove(id: string): void {
    pairs = pairs.filter(p => p.id !== id);
    notify();
    persist();
  },
  clear(): void {
    pairs = [];
    notify();
    persist();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
