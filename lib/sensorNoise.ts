// Background-noise reading for the Settings accelerometer test.
// A launch fires once the signal stays over the threshold for SUSTAINED
// samples in a row, so the noise that matters is the strongest *sustained*
// level — the max over every SUSTAINED-sample window of that window's
// minimum — not a single spike.

export type PresetKey = "gentle" | "normal" | "hard";

export const NOISE_MARGIN = 1.25; // suggest a preset at least 25% above the noise

export function sustainedPeak(mags: number[], sustained = 5): number {
  if (mags.length < sustained) return 0;
  let best = 0;
  for (let i = 0; i + sustained <= mags.length; i++) {
    let lo = Infinity;
    for (let j = i; j < i + sustained; j++) if (mags[j] < lo) lo = mags[j];
    if (lo > best) best = lo;
  }
  return best;
}

// Most sensitive preset that the noise won't trip, or null when even HARD
// is too close (use CUSTOM, or the test caught a launch rather than noise).
export function suggestSensitivity(
  noise: number,
  thresholds: Record<PresetKey, number>,
): PresetKey | null {
  const order: PresetKey[] = ["gentle", "normal", "hard"];
  return order.find(k => thresholds[k] >= noise * NOISE_MARGIN) ?? null;
}
