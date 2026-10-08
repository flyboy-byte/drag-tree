// Tests for the PLAN.md scaffold modules (pure logic only).

import { computeConsistency } from "../lib/consistency";
import { sampleRateStats, displayDelayMs, tapOffsetMs } from "../lib/latency";
import { averageOffset, applyOffset, isValidSlipRT } from "../lib/slipCalibration";
import { holdDecision, canStartCountdown } from "../lib/holdRelease";
import { decideWinner, addToTally } from "../lib/versus";
import { gradeRT } from "../lib/timing";
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
  it("sample rate from steady 8 ms samples", () => {
    const s = sampleRateStats([0, 8, 16, 24, 32])!;
    expect(s.hz).toBeCloseTo(125);
    expect(s.jitterMs).toBeCloseTo(0);
    expect(s.maxGapMs).toBe(8);
  });
  it("needs a few samples", () => expect(sampleRateStats([0, 8])).toBeNull());
  it("display delay never negative", () => {
    expect(displayDelayMs(100, 116)).toBe(16);
    expect(displayDelayMs(100, 90)).toBe(0);
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
  it("tally", () => {
    const t = addToTally({ top: 0, bottom: 0, ties: 0 }, decideWinner(0.1, 0.2));
    expect(t).toEqual({ top: 1, bottom: 0, ties: 0 });
  });
});
