// Latency check helpers (PLAN.md idea 2).
// Summarises how much of a reaction time is the phone rather than the driver.
// Pure functions; the diagnostic screen feeds them timestamps it already has.

export interface SampleRateStats {
  count: number;
  meanIntervalMs: number;
  hz: number;
  jitterMs: number;   // std dev of the interval
  maxGapMs: number;   // worst single gap — a missed sample widens onset error
}

// timestamps: performance.now()-aligned sample times in ms, oldest first.
export function sampleRateStats(timestamps: number[]): SampleRateStats | null {
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

// Display latency: green was scheduled at `scheduledAt`, first painted at
// `paintedAt` (the rAF timestamp already captured as greenAtRef).
export function displayDelayMs(scheduledAt: number, paintedAt: number): number {
  return Math.max(0, paintedAt - scheduledAt);
}

// Tap test: user taps along with a steady flash. Each pair is
// (flashAt, tapAt). Returns mean offset in ms — touch latency plus the
// person, so the UI must label it as an estimate.
export function tapOffsetMs(pairs: Array<[number, number]>): number | null {
  if (pairs.length === 0) return null;
  return pairs.reduce((s, [flash, tap]) => s + (tap - flash), 0) / pairs.length;
}
