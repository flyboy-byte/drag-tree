// Launch detection on a stream of linear-acceleration magnitudes.
//
// Used live (hooks/useAccelerometer) and on recorded captures (Settings →
// accelerometer test). Everything is in milliseconds rather than sample
// counts so it behaves the same on a 60 Hz phone and a 200 Hz one.
//
// 1. Sustain gate: the magnitude must stay at/over the threshold for
//    SUSTAIN_MS (and at least MIN_SUSTAIN_SAMPLES samples). Bumps and
//    vibration spikes are over in < 30 ms and get rejected.
// 2. Onset rewind: from the confirming sample, walk back while each sample
//    is still on a rise (slope over the SLOPE_WINDOW_MS before it ≥
//    ONSET_SLOPE). The earliest such sample is the reported launch time —
//    the start of acceleration, not the moment it crossed the threshold or
//    was confirmed. Reporting the sample itself (not the start of its slope
//    window) keeps the estimate from landing before the real start; it can
//    be a few ms late on a very gentle ramp, never early.

export const SUSTAIN_MS = 40;
export const MIN_SUSTAIN_SAMPLES = 3;
export const SLOPE_WINDOW_MS = 30;
// m/s² per ms. A real launch ramp 0 → 1.5 m/s² in ~80 ms is ≈ 0.019;
// hand-held noise over 30 ms averages ≈ 0.001–0.002.
export const ONSET_SLOPE = 0.004;
export const MAX_REWIND_MS = 150;
export const BUFFER_MS = 300;

export interface MotionSample {
  t: number;   // performance.now()-aligned ms
  mag: number; // linear acceleration magnitude, m/s²
}

export interface Detection {
  onsetT: number;
  thresholdT: number;
  confirmT: number;
}

export function findOnset(buf: MotionSample[], confirmIdx: number): number {
  const confirmT = buf[confirmIdx].t;
  let onsetIdx = confirmIdx;
  let j = confirmIdx;
  for (let i = confirmIdx; i > 0; i--) {
    if (buf[i].t < confirmT - MAX_REWIND_MS) break;
    // j = latest sample at least SLOPE_WINDOW_MS before i
    if (j > i) j = i;
    while (j > 0 && buf[i].t - buf[j].t < SLOPE_WINDOW_MS) j--;
    const dt = buf[i].t - buf[j].t;
    if (dt < SLOPE_WINDOW_MS) break; // not enough history
    const slope = (buf[i].mag - buf[j].mag) / dt;
    if (slope >= ONSET_SLOPE) onsetIdx = i;
    else break;
  }
  return buf[onsetIdx].t;
}

export interface LaunchDetector {
  push(s: MotionSample): Detection | null;
  reset(): void;
  readonly buffer: readonly MotionSample[];
}

// `seed` carries recent samples over from a previous detector (e.g. across
// the switch from red-light watching to launch watching at green) so the
// onset rewind has history from the first sample on.
export function createLaunchDetector(threshold: number, seed: readonly MotionSample[] = []): LaunchDetector {
  let buf: MotionSample[] = seed.slice();
  let runStart: MotionSample | null = null;
  let runCount = 0;
  let fired = false;

  return {
    get buffer() { return buf; },
    reset() {
      buf = [];
      runStart = null;
      runCount = 0;
      fired = false;
    },
    push(s) {
      buf.push(s);
      while (buf.length > 1 && buf[0].t < s.t - BUFFER_MS) buf.shift();
      if (fired) return null;

      if (s.mag < threshold) {
        runStart = null;
        runCount = 0;
        return null;
      }
      if (runStart === null) runStart = s;
      runCount += 1;
      if (runCount >= MIN_SUSTAIN_SAMPLES && s.t - runStart.t >= SUSTAIN_MS - 1) {
        fired = true;
        return { onsetT: findOnset(buf, buf.length - 1), thresholdT: runStart.t, confirmT: s.t };
      }
      return null;
    },
  };
}

// Run a detector over a whole recording (Settings capture analysis).
export function detectInRecording(samples: MotionSample[], threshold: number): Detection | null {
  const d = createLaunchDetector(threshold);
  for (const s of samples) {
    const hit = d.push(s);
    if (hit) return hit;
  }
  return null;
}
