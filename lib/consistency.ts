// Consistency stats over recent runs (PLAN.md idea 1).
// Pure functions over RunRecord history — no state, no storage.
// Records are newest-first, matching useTreeSession.

import type { RunRecord } from "@/hooks/useTreeSession";

export interface ConsistencyStats {
  cleanCount: number;        // non-redlight runs considered
  meanRT: number | null;
  stdDev: number | null;     // population std dev; null under 2 clean runs
  withinPct: number | null;  // % of clean runs within ±window of meanRT
  streak: number;            // newest-first run of consecutive clean runs within window
}

// ±20 ms is the "tight" band most bracket racers talk about.
export const DEFAULT_WINDOW = 0.020;

// Auto-late timeouts are recorded as 2.0 s — a missed launch, not a reaction.
const TIMEOUT_RT = 2.0;

const isClean = (r: RunRecord) =>
  r.grade !== "redlight" && r.reactionTime >= 0 && r.reactionTime < TIMEOUT_RT;

export function computeConsistency(
  records: RunRecord[],
  window = DEFAULT_WINDOW,
): ConsistencyStats {
  const clean = records.filter(isClean);
  const times = clean.map(r => r.reactionTime);
  const n = times.length;

  if (n === 0) {
    return { cleanCount: 0, meanRT: null, stdDev: null, withinPct: null, streak: 0 };
  }

  const mean = times.reduce((s, t) => s + t, 0) / n;
  const stdDev = n >= 2
    ? Math.sqrt(times.reduce((s, t) => s + (t - mean) ** 2, 0) / n)
    : null;
  const within = times.filter(t => Math.abs(t - mean) <= window).length;

  // Streak walks the full history (red lights and timeouts break it).
  let streak = 0;
  for (const r of records) {
    if (!isClean(r) || Math.abs(r.reactionTime - mean) > window) break;
    streak++;
  }

  return {
    cleanCount: n,
    meanRT: mean,
    stdDev,
    withinPct: n >= 2 ? (within / n) * 100 : null,
    streak,
  };
}
