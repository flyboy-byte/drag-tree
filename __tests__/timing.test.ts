import { gradeRT, computeSeriesSummary } from "../lib/timing";

// ── gradeRT boundary cases ────────────────────────────────────────────────────

describe("gradeRT", () => {
  describe("red light", () => {
    it("any negative RT is a red light", () => {
      expect(gradeRT(-0.001)).toBe("redlight");
      expect(gradeRT(-0.1)).toBe("redlight");
      expect(gradeRT(-2.0)).toBe("redlight");
    });
  });

  describe("perfect (0 – 0.049)", () => {
    it("exactly 0.000 is perfect", () => expect(gradeRT(0.000)).toBe("perfect"));
    it("0.001 is perfect",         () => expect(gradeRT(0.001)).toBe("perfect"));
    it("0.049 is perfect",         () => expect(gradeRT(0.049)).toBe("perfect"));
    it("0.050 is NOT perfect",     () => expect(gradeRT(0.050)).not.toBe("perfect"));
  });

  describe("pro (0.050 – 0.099)", () => {
    it("0.050 is pro",         () => expect(gradeRT(0.050)).toBe("pro"));
    it("0.099 is pro",         () => expect(gradeRT(0.099)).toBe("pro"));
    it("0.100 is NOT pro",     () => expect(gradeRT(0.100)).not.toBe("pro"));
  });

  describe("great (0.100 – 0.199)", () => {
    it("0.100 is great",       () => expect(gradeRT(0.100)).toBe("great"));
    it("0.199 is great",       () => expect(gradeRT(0.199)).toBe("great"));
    it("0.200 is NOT great",   () => expect(gradeRT(0.200)).not.toBe("great"));
  });

  describe("good (0.200 – 0.349)", () => {
    it("0.200 is good",        () => expect(gradeRT(0.200)).toBe("good"));
    it("0.349 is good",        () => expect(gradeRT(0.349)).toBe("good"));
    it("0.350 is NOT good",    () => expect(gradeRT(0.350)).not.toBe("good"));
  });

  describe("late (> 0.349)", () => {
    it("0.350 is late",        () => expect(gradeRT(0.350)).toBe("late"));
    it("0.400 is late",        () => expect(gradeRT(0.400)).toBe("late"));
    it("2.000 is late",        () => expect(gradeRT(2.000)).toBe("late"));
  });
});

// ── computeSeriesSummary ──────────────────────────────────────────────────────

describe("computeSeriesSummary", () => {
  it("returns null stats for an all-redlight series", () => {
    const runs = [
      { reactionTime: -0.5, grade: "redlight" as const },
      { reactionTime: -1.2, grade: "redlight" as const },
      { reactionTime: -0.1, grade: "redlight" as const },
    ];
    const s = computeSeriesSummary(runs, 3);
    expect(s.avgRT).toBeNull();
    expect(s.bestRT).toBeNull();
    expect(s.worstRT).toBeNull();
    expect(s.redLightCount).toBe(3);
    expect(s.consistency).toBe("No clean runs");
  });

  it("includes late runs in stats (not filtered out)", () => {
    const runs = [
      { reactionTime: 0.100, grade: "great" as const },
      { reactionTime: 0.400, grade: "late" as const },
      { reactionTime: 0.500, grade: "late" as const },
    ];
    const s = computeSeriesSummary(runs, 3);
    expect(s.bestRT).toBeCloseTo(0.100);
    expect(s.worstRT).toBeCloseTo(0.500);
    // avg = (0.1 + 0.4 + 0.5) / 3 = 0.333...
    expect(s.avgRT).toBeCloseTo(1.0 / 3.0);
  });

  it("excludes red-light runs from time stats but counts them", () => {
    const runs = [
      { reactionTime: 0.120, grade: "great" as const },
      { reactionTime: -1.0,  grade: "redlight" as const },
      { reactionTime: 0.200, grade: "good" as const },
    ];
    const s = computeSeriesSummary(runs, 3);
    expect(s.bestRT).toBeCloseTo(0.120);
    expect(s.worstRT).toBeCloseTo(0.200);
    expect(s.redLightCount).toBe(1);
  });

  it("correctly tracks best and worst across a clean series", () => {
    const runs = [
      { reactionTime: 0.150, grade: "great" as const },
      { reactionTime: 0.080, grade: "pro" as const },
      { reactionTime: 0.210, grade: "good" as const },
      { reactionTime: 0.045, grade: "perfect" as const },
      { reactionTime: 0.320, grade: "good" as const },
    ];
    const s = computeSeriesSummary(runs, 5);
    expect(s.bestRT).toBeCloseTo(0.045);
    expect(s.worstRT).toBeCloseTo(0.320);
  });

  it("reports Consistent when stdDev < 0.020", () => {
    const runs = [
      { reactionTime: 0.100, grade: "great" as const },
      { reactionTime: 0.110, grade: "great" as const },
      { reactionTime: 0.105, grade: "great" as const },
    ];
    const s = computeSeriesSummary(runs, 3);
    expect(s.consistency).toBe("Consistent");
  });

  it("reports One clean run when only one valid run", () => {
    const runs = [
      { reactionTime: 0.120, grade: "great" as const },
      { reactionTime: -0.5,  grade: "redlight" as const },
    ];
    const s = computeSeriesSummary(runs, 3);
    expect(s.consistency).toBe("One clean run");
  });

  it("size field matches the requested series size, not the run count", () => {
    const runs = [{ reactionTime: 0.100, grade: "great" as const }];
    expect(computeSeriesSummary(runs, 5).size).toBe(5);
    expect(computeSeriesSummary(runs, 10).size).toBe(10);
  });

  // Onset rewind red-light: small negative delta (fired just after green but
  // onset rewinds to before it). Must not appear in clean-time stats.
  it("treats small-magnitude negative RT as red light — excluded from stats", () => {
    const runs = [
      { reactionTime: -0.005, grade: "redlight" as const },
      { reactionTime:  0.150, grade: "great" as const },
    ];
    const s = computeSeriesSummary(runs, 3);
    expect(s.bestRT).toBeCloseTo(0.150);
    expect(s.worstRT).toBeCloseTo(0.150);
    expect(s.redLightCount).toBe(1);
  });
});
