// Background-noise reading for the Settings accelerometer test.
// A launch fires once the signal stays over the threshold for SUSTAIN_MS
// (lib/launchDetector), so the noise that matters is the strongest
// *sustained* level — the max over every SUSTAIN_MS window of that window's
// minimum — not a single spike.

import { SUSTAIN_MS, type MotionSample } from "./launchDetector";

export type PresetKey = "gentle" | "normal" | "hard";

export const NOISE_MARGIN = 1.25; // suggest a preset at least 25% above the noise

export function sustainedPeak(samples: readonly MotionSample[], windowMs = SUSTAIN_MS): number {
  let best = 0;
  for (let i = 0; i < samples.length; i++) {
    let lo = Infinity;
    let j = i;
    for (; j < samples.length && samples[j].t - samples[i].t < windowMs; j++) {
      if (samples[j].mag < lo) lo = samples[j].mag;
    }
    if (j >= samples.length) break; // window runs past the end of the recording
    if (samples[j].mag < lo) lo = samples[j].mag;
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
