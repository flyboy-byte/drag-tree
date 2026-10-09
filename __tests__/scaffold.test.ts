// Tests for the PLAN.md scaffold modules (pure logic only).

import { computeConsistency } from "../lib/consistency";
import { rateStats, pairTaps, tapOffsetMs } from "../lib/latency";
import { averageOffset, applyOffset, isValidSlipRT, parseSlipInput } from "../lib/slipCalibration";
import { holdDecision, canStartCountdown } from "../lib/holdRelease";
import { decideWinner, addToTally, laneRT } from "../lib/versus";
import { gradeRT } from "../lib/timing";
import { sustainedPeak, suggestSensitivity } from "../lib/sensorNoise";
import { createLaunchDetector, detectInRecording, SUSTAIN_MS } from "../lib/launchDetector";
import { createGravityFilter } from "../lib/gravity";
import { createClockMap } from "../lib/motionSource";
import type { RunRecord } from "../hooks/useTreeSession";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const run = (rt: number, i = 0): RunRecord => ({
  id: String(i), reactionTime: rt, grade: gradeRT(rt), mode: "pro",
});

describe("computeConsistency", () => {
  it("empty history", () => {
    expect(computeConsistency([])).toEqual({
      cleanCount: 0, meanRT: null, stdDev: null, withinPct: null, streak: 0,
    });
  });

  it("ignores red lights in the stats", () => {
    const s = computeConsistency([run(0.1), run(-0.05), run(0.1)]);
    expect(s.cleanCount).toBe(2);
    expect(s.meanRT).toBeCloseTo(0.1);
    expect(s.stdDev).toBeCloseTo(0);
  });

  it("within % and streak", () => {
    // newest-first: three tight runs, then a red light, then a wild one
    const s = computeConsistency([run(0.100), run(0.105), run(0.095), run(-0.02), run(0.300)]);
    expect(s.cleanCount).toBe(4);
    expect(s.withinPct).toBe(0); // mean is pulled to ~0.15 by the 0.300
    const tight = computeConsistency([run(0.100), run(0.105), run(0.095), run(-0.02)]);
    expect(tight.withinPct).toBe(100);
    expect(tight.streak).toBe(3); // red light breaks it
  });

  it("ignores 2.0 s timeouts", () => {
    const s = computeConsistency([run(0.1), run(2.0), run(0.1)]);
    expect(s.cleanCount).toBe(2);
    expect(s.meanRT).toBeCloseTo(0.1);
    expect(s.streak).toBe(1);
  });
});

describe("latency", () => {
  it("rate from steady 8 ms samples", () => {
    const s = rateStats([0, 8, 16, 24, 32])!;
    expect(s.hz).toBeCloseTo(125);
    expect(s.jitterMs).toBeCloseTo(0);
    expect(s.maxGapMs).toBe(8);
  });
  it("needs a few samples", () => expect(rateStats([0, 8])).toBeNull());
  it("pairs taps with the nearest flash after warmup", () => {
    const flashes = [0, 600, 1200, 1800, 2400, 3000];
    const taps = [20, 630, 1210, 1830, 2420, 2990, 5000];
    expect(pairTaps(flashes, taps, 600, 4)).toEqual([[2400, 2420], [3000, 2990]]);
  });
  it("tap offset", () => {
    expect(tapOffsetMs([])).toBeNull();
    expect(tapOffsetMs([[0, 50], [1000, 1070]])).toBe(60);
  });
});

describe("slip calibration", () => {
  const p = (appRT: number, slipRT: number) => ({ id: "x", appRT, slipRT, at: 0 });
  it("average offset", () => {
    expect(averageOffset([])).toBeNull();
    expect(averageOffset([p(0.10, 0.13), p(0.20, 0.21)])).toBeCloseTo(0.02);
  });
  it("apply offset", () => {
    expect(applyOffset(0.1, null)).toBe(0.1);
    expect(applyOffset(0.1, 0.02)).toBeCloseTo(0.12);
  });
  it("rejects typos", () => {
    expect(isValidSlipRT(0.123)).toBe(true);
    expect(isValidSlipRT(-0.05)).toBe(true);
    expect(isValidSlipRT(12.3)).toBe(false);
    expect(isValidSlipRT(NaN)).toBe(false);
  });
  it("parses slip input", () => {
    expect(parseSlipInput("0.112")).toBeCloseTo(0.112);
    expect(parseSlipInput(".112")).toBeCloseTo(0.112);
    expect(parseSlipInput(" -.05 ")).toBeCloseTo(-0.05);
    expect(parseSlipInput("0,112")).toBeCloseTo(0.112);
    expect(parseSlipInput("")).toBeNull();
    expect(parseSlipInput("abc")).toBeNull();
    expect(parseSlipInput("12.3")).toBeNull();
  });
});

describe("hold and release", () => {
  it("press during staging arms", () => {
    expect(holdDecision("staging", false, { kind: "press" })).toEqual({ kind: "armed" });
  });
  it("release before green is a red light", () => {
    expect(holdDecision("countdown", true, { kind: "release", at: 5 }))
      .toEqual({ kind: "redlight", at: 5 });
  });
  it("release on green launches", () => {
    expect(holdDecision("go", true, { kind: "release", at: 9 }))
      .toEqual({ kind: "launch", at: 9 });
  });
  it("release without a hold does nothing", () => {
    expect(holdDecision("go", false, { kind: "release", at: 9 })).toEqual({ kind: "none" });
  });
  it("countdown needs a hold", () => {
    expect(canStartCountdown(false)).toEqual({ kind: "notHeld" });
    expect(canStartCountdown(true)).toEqual({ kind: "none" });
  });
});

describe("versus", () => {
  it("quicker light wins", () => expect(decideWinner(0.05, 0.08).winner).toBe("top"));
  it("same to the ms is a tie", () => expect(decideWinner(0.0501, 0.0504).winner).toBe("tie"));
  it("red light loses", () => expect(decideWinner(-0.01, 0.3).winner).toBe("bottom"));
  it("both red: earlier red loses", () => expect(decideWinner(-0.10, -0.01).winner).toBe("bottom"));
  it("no-show loses", () => expect(decideWinner(0.4, null).winner).toBe("top"));
  it("nobody went", () => expect(decideWinner(null, null).winner).toBe("none"));
  it("lane RT: on green is positive", () => expect(laneRT("go", 1120, 1000, 1000)).toBeCloseTo(0.12));
  it("lane RT: before green is a negative red light", () => {
    expect(laneRT("countdown", 950, null, 1000)).toBeCloseTo(-0.05);
    expect(laneRT("staging", 1000, null, 1000)).toBe(-0.001);
  });
  it("lane RT: idle/done taps don't count", () => {
    expect(laneRT("idle", 5, null, null)).toBeNull();
    expect(laneRT("done", 5, 1, 1)).toBeNull();
  });
  it("tally", () => {
    const t = addToTally({ top: 0, bottom: 0, ties: 0 }, decideWinner(0.1, 0.2));
    expect(t).toEqual({ top: 1, bottom: 0, ties: 0 });
  });
});

describe("sensorNoise", () => {
  const T = { gentle: 1.5, normal: 2.5, hard: 4.5 };
  // 200 Hz recording from magnitudes
  const rec = (mags: number[], dt = 5) => mags.map((mag, i) => ({ t: i * dt, mag }));

  it("ignores a spike shorter than the sustain window", () => {
    const m = new Array(40).fill(0.1);
    for (let i = 10; i < 14; i++) m[i] = 5; // 20 ms spike
    expect(sustainedPeak(rec(m))).toBeCloseTo(0.1);
  });

  it("finds the strongest sustained level", () => {
    const m = new Array(60).fill(0.2);
    for (let i = 10; i < 30; i++) m[i] = 1.0 + (i % 2) * 0.3; // 100 ms at ≥ 1.0
    expect(sustainedPeak(rec(m))).toBeCloseTo(1.0);
  });

  it("returns 0 for a recording shorter than the window", () => {
    expect(sustainedPeak(rec([3, 3, 3]))).toBe(0);
  });

  it("suggests the most sensitive preset with margin", () => {
    expect(suggestSensitivity(0.3, T)).toBe("gentle");
    expect(suggestSensitivity(1.3, T)).toBe("normal"); // 1.5 < 1.3 * 1.25
    expect(suggestSensitivity(3.0, T)).toBe("hard");
    expect(suggestSensitivity(4.0, T)).toBeNull();
  });
});

describe("launchDetector", () => {
  // Quiet, then a linear ramp from `rampAt` ms reaching `peak` m/s² after 80 ms, then held.
  const launch = (hz: number, rampAt = 500, peak = 4, total = 1000) => {
    const dt = 1000 / hz;
    const out = [];
    for (let t = 0; t <= total; t += dt) {
      const r = t < rampAt ? 0 : Math.min(1, (t - rampAt) / 80);
      out.push({ t, mag: 0.1 + r * peak });
    }
    return out;
  };

  it.each([60, 125, 200])("finds onset near the ramp start at %i Hz", hz => {
    const d = detectInRecording(launch(hz), 1.5)!;
    expect(d).not.toBeNull();
    // never before the real start, at most one sample + a few ms after
    expect(d.onsetT).toBeGreaterThanOrEqual(500);
    expect(d.onsetT - 500).toBeLessThanOrEqual(1000 / hz + 3);
    expect(d.confirmT - d.thresholdT).toBeGreaterThanOrEqual(SUSTAIN_MS - 1);
  });

  it("rejects a short bump", () => {
    const s = launch(200, 99999); // quiet throughout
    for (const x of s) if (x.t >= 300 && x.t < 325) x.mag = 6; // 25 ms
    expect(detectInRecording(s, 1.5)).toBeNull();
  });

  it("fires only once per detector", () => {
    const d = createLaunchDetector(1.5);
    const hits = launch(200).map(s => d.push(s)).filter(Boolean);
    expect(hits).toHaveLength(1);
  });

  it("seeded buffer lets the onset rewind past the hand-over", () => {
    const s = launch(200);
    const first = createLaunchDetector(99); // never fires
    const cut = s.findIndex(x => x.t >= 520);
    s.slice(0, cut).forEach(x => first.push(x));
    const second = createLaunchDetector(1.5, first.buffer);
    let hit = null;
    for (const x of s.slice(cut)) hit = hit ?? second.push(x);
    expect(hit!.onsetT).toBeLessThan(510);
  });
});

describe("gravity filter", () => {
  it("reads ~0 for a still, tilted phone and sees a launch", () => {
    const f = createGravityFilter();
    let mag = 0;
    for (let t = 0; t < 2000; t += 5) mag = f.push(0, 6.9, 6.9, t); // 45° tilt
    expect(mag).toBeCloseTo(0, 3);
    for (let t = 2000; t < 2100; t += 5) mag = f.push(3, 6.9, 6.9, t); // 3 m/s² forward
    expect(mag).toBeGreaterThan(2.9); // frozen, not absorbed
  });

  it("re-settles after a lasting tilt", () => {
    const f = createGravityFilter();
    for (let t = 0; t < 1000; t += 5) f.push(0, 0, 9.81, t);
    let mag = 0;
    for (let t = 1000; t < 6000; t += 5) mag = f.push(0, 3, 9.34, t); // tilted ~18°
    expect(mag).toBeLessThan(0.3);
  });
});

describe("clock map", () => {
  it("uses a plausible measured offset", () => {
    const c = createClockMap(1000);
    expect(c.map(50, 1052)).toBe(1050);
  });

  it("falls back to the running minimum when the offset is wrong", () => {
    const c = createClockMap(999999);
    c.map(0, 1010);
    c.map(10, 1012);
    expect(c.map(20, 1030)).toBe(1022); // min(arrival - t) = 1002
  });
});
