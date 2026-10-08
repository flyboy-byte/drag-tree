// Latency check helpers (PLAN.md idea 2).
// Summarises how much of a reaction time is the phone rather than the driver.
// Pure functions; components/LatencyCheck.tsx feeds them timestamps.

export interface RateStats {
  count: number;
  meanIntervalMs: number;
  hz: number;
  jitterMs: number;   // std dev of the interval
  maxGapMs: number;   // worst single gap — a missed sample/frame
}

// timestamps: performance.now()-aligned times in ms, oldest first.
// Works for sensor samples and for requestAnimationFrame frames alike.
export function rateStats(timestamps: number[]): RateStats | null {
  if (timestamps.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const g = timestamps[i] - timestamps[i - 1];
    if (g > 0) gaps.push(g);
  }
  if (gaps.length < 2) return null;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const jitter = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  return {
    count: timestamps.length,
    meanIntervalMs: mean,
    hz: 1000 / mean,
    jitterMs: jitter,
    maxGapMs: Math.max(...gaps),
  };
}

// Tap test: the user taps along with a steady flash. Each tap is paired with
// the nearest flash within half a beat; the first `warmup` flashes are
// ignored while the user finds the rhythm. Returns (flash, tap) pairs.
export function pairTaps(
  flashes: number[],
  taps: number[],
  beatMs: number,
  warmup = 4,
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const used = new Set<number>();
  for (const tap of taps) {
    let best = -1;
    let bestDist = beatMs / 2;
    flashes.forEach((f, i) => {
      const d = Math.abs(tap - f);
      if (d < bestDist && !used.has(i)) { best = i; bestDist = d; }
    });
    if (best >= warmup) {
      used.add(best);
      pairs.push([flashes[best], tap]);
    }
  }
  return pairs;
}

// Mean tap offset in ms (positive = taps landed after the flash). This is
// touch latency plus the person, so the UI must call it an estimate.
export function tapOffsetMs(pairs: Array<[number, number]>): number | null {
  if (pairs.length === 0) return null;
  return pairs.reduce((s, [flash, tap]) => s + (tap - flash), 0) / pairs.length;
}
