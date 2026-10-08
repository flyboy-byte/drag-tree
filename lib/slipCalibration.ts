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
  recordId?: string; // RunRecord.id this slip was entered against
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

// Parse what a user types from a slip: "0.112", ".112", "-.05", "0,112".
export function parseSlipInput(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const v = Number(t);
  return isValidSlipRT(v) ? v : null;
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
          typeof p.at === "number" &&
          (p.recordId === undefined || typeof p.recordId === "string"),
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
  // One slip per run: re-entering for the same recordId replaces it.
  add(appRT: number, slipRT: number, recordId?: string): void {
    if (!isValidSlipRT(slipRT)) return;
    const pair: SlipPair = { id: `${Date.now()}`, recordId, appRT, slipRT, at: Date.now() };
    const rest = recordId ? pairs.filter(p => p.recordId !== recordId) : pairs;
    pairs = [pair, ...rest].slice(0, MAX_PAIRS);
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
