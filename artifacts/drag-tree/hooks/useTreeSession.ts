import { useState, useCallback, useRef, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TreeState } from "@/components/ChristmasTree";
import type { ReactionGrade } from "@/components/ReactionDisplay";

export type TreeMode = "full" | "pro";

export interface RunRecord {
  id: string;
  reactionTime: number;
  grade: ReactionGrade;
  mode: TreeMode;
}

// ── Series types ───────────────────────────────────────────────────────────
export interface SeriesRun {
  reactionTime: number;
  grade: ReactionGrade;
}

export interface SeriesSummary {
  size: number;
  runs: SeriesRun[];
  avgRT: number | null;
  bestRT: number | null;
  worstRT: number | null;
  redLightCount: number;
  consistency: string;
}

function computeSeriesSummary(runs: SeriesRun[], size: number): SeriesSummary {
  const cleanTimes = runs
    .filter(r => r.grade !== "redlight" && r.grade !== "late" && r.reactionTime >= 0)
    .map(r => r.reactionTime);

  const avgRT = cleanTimes.length > 0
    ? cleanTimes.reduce((s, t) => s + t, 0) / cleanTimes.length
    : null;
  const bestRT = cleanTimes.length > 0 ? Math.min(...cleanTimes) : null;
  const worstRT = cleanTimes.length > 0 ? Math.max(...cleanTimes) : null;
  const redLightCount = runs.filter(r => r.grade === "redlight").length;

  let consistency = "—";
  if (cleanTimes.length >= 3) {
    const mean = avgRT!;
    const variance = cleanTimes.reduce((s, t) => s + (t - mean) ** 2, 0) / cleanTimes.length;
    const stdDev = Math.sqrt(variance);
    const half = Math.floor(cleanTimes.length / 2);
    const firstAvg = cleanTimes.slice(0, half).reduce((s, t) => s + t, 0) / half;
    const secondAvg = cleanTimes.slice(Math.ceil(cleanTimes.length / 2)).reduce((s, t) => s + t, 0)
      / (cleanTimes.length - Math.ceil(cleanTimes.length / 2));
    const trend = firstAvg - secondAvg; // positive = getting faster
    if (stdDev < 0.020) consistency = "Consistent";
    else if (trend > 0.030) consistency = "Improving";
    else if (trend < -0.030) consistency = "Fading";
    else consistency = "Mixed";
  } else if (cleanTimes.length === 2) {
    const diff = cleanTimes[0] - cleanTimes[1];
    if (Math.abs(diff) < 0.020) consistency = "Consistent";
    else if (diff > 0) consistency = "Improving";
    else consistency = "Fading";
  } else if (cleanTimes.length === 1) {
    consistency = "One clean run";
  } else {
    consistency = "No clean runs";
  }

  return { size, runs, avgRT, bestRT, worstRT, redLightCount, consistency };
}

export type SessionPhase =
  | "idle"
  | "staging"
  | "countdown"
  | "go"
  | "result"
  | "redlight";

const INITIAL_TREE: TreeState = {
  preStage: false,
  stage: false,
  amber1: false,
  amber2: false,
  amber3: false,
  green: false,
  red: false,
};

// AsyncStorage keys — bumping the suffix is the migration path if the
// shape of RunRecord ever changes incompatibly.
const STORAGE_KEY_RECORDS  = "dragtree.history.v1";
const STORAGE_KEY_BEST     = "dragtree.bestTime.v1";

function gradeRT(rt: number): ReactionGrade {
  if (rt < 0) return "redlight";
  if (rt <= 0.049) return "perfect";
  if (rt <= 0.099) return "pro";
  if (rt <= 0.199) return "great";
  if (rt <= 0.349) return "good";
  return "late";
}

export function useTreeSession() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [tree, setTree] = useState<TreeState>(INITIAL_TREE);
  const [mode, setMode] = useState<TreeMode>("pro");
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [grade, setGrade] = useState<ReactionGrade>(null);
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [bestTime, setBestTime] = useState<number | null>(null);

  const greenAtRef = useRef<number | null>(null);
  const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef<SessionPhase>("idle");
  const modeRef = useRef<TreeMode>("pro");
  // Hydration guard: don't write to AsyncStorage until we've finished
  // reading the initial values, otherwise the first render's empty state
  // would clobber the stored history.
  const hydratedRef = useRef(false);

  // ── Series state ──────────────────────────────────────────────────────
  const seriesEnabledRef  = useRef(false);
  const seriesSizeRef     = useRef<3 | 5 | 10>(5);
  const seriesRunsRef     = useRef<SeriesRun[]>([]);
  const seriesCompleteRef = useRef(false);
  const [seriesCount, setSeriesCount]       = useState(0);
  const [seriesSummary, setSeriesSummary]   = useState<SeriesSummary | null>(null);

  // ── Hydrate persisted history + best on mount ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawRecords, rawBest] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_RECORDS),
          AsyncStorage.getItem(STORAGE_KEY_BEST),
        ]);
        if (cancelled) return;
        if (rawRecords) {
          const parsed: unknown = JSON.parse(rawRecords);
          if (Array.isArray(parsed)) {
            // Light shape validation; drop any malformed entries silently
            // rather than crashing on schema drift.
            const safe = parsed.filter((r): r is RunRecord =>
              !!r && typeof r === "object" &&
              typeof (r as RunRecord).id === "string" &&
              typeof (r as RunRecord).reactionTime === "number" &&
              typeof (r as RunRecord).mode === "string"
            );
            setRecords(safe.slice(0, 30));
          }
        }
        if (rawBest) {
          const n = Number(rawBest);
          if (Number.isFinite(n) && n > 0) setBestTime(n);
        }
      } catch {
        // Storage unavailable — proceed with empty state, no user-facing error.
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Persist on change (after hydration) ───────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records)).catch(() => {});
  }, [records]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (bestTime === null) {
      AsyncStorage.removeItem(STORAGE_KEY_BEST).catch(() => {});
    } else {
      AsyncStorage.setItem(STORAGE_KEY_BEST, String(bestTime)).catch(() => {});
    }
  }, [bestTime]);

  const updatePhase = (p: SessionPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearTimers = () => {
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];
  };

  const recordResult = useCallback((rt: number, g: ReactionGrade) => {
    setReactionTime(rt);
    setGrade(g);
    const record: RunRecord = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      reactionTime: rt,
      grade: g,
      mode: modeRef.current,
    };
    setRecords(prev => [record, ...prev].slice(0, 30));
    if (g !== "redlight") {
      setBestTime(prev => (prev === null || rt < prev ? rt : prev));
    }
    // ── Series accumulation ──────────────────────────────────────────────
    if (seriesEnabledRef.current) {
      const newRuns = [...seriesRunsRef.current, { reactionTime: rt, grade: g }];
      seriesRunsRef.current = newRuns;
      const newCount = newRuns.length;
      setSeriesCount(newCount);
      if (newCount >= seriesSizeRef.current) {
        seriesCompleteRef.current = true;
        setSeriesSummary(computeSeriesSummary(newRuns, seriesSizeRef.current));
      }
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    updatePhase("idle");
    setTree(INITIAL_TREE);
    setReactionTime(null);
    setGrade(null);
    greenAtRef.current = null;
    // Clear series state when the series is done (user starting a new series)
    // or when series is not active. Mid-series: keep accumulated runs.
    if (seriesCompleteRef.current || !seriesEnabledRef.current) {
      seriesRunsRef.current = [];
      seriesCompleteRef.current = false;
      setSeriesCount(0);
      setSeriesSummary(null);
    }
  }, []);

  // Configure series mode from settings. Disabling clears any in-progress state.
  const setSeries = useCallback((enabled: boolean, size: 3 | 5 | 10) => {
    seriesEnabledRef.current = enabled;
    seriesSizeRef.current = size;
    if (!enabled) {
      seriesRunsRef.current = [];
      seriesCompleteRef.current = false;
      setSeriesCount(0);
      setSeriesSummary(null);
    }
  }, []);

  // Wipe persisted history (called by the History "clear" button).
  const clearHistory = useCallback(() => {
    setRecords([]);
    setBestTime(null);
  }, []);

  const startSequence = useCallback(() => {
    clearTimers();
    setReactionTime(null);
    setGrade(null);
    greenAtRef.current = null;

    const randomDelay = 1500 + Math.random() * 1500;
    const isPro = modeRef.current === "pro";

    // Pro Tree:  all 3 ambers fire simultaneously, green 400ms later
    // Full Tree: ambers fire sequentially 500ms apart, green 500ms after last amber
    const amberInterval = isPro ? 0 : 500;
    const greenDelay    = isPro ? 400 : 500;

    updatePhase("staging");
    setTree({ ...INITIAL_TREE });

    const ids: ReturnType<typeof setTimeout>[] = [];

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, preStage: true }));
    }, randomDelay));

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, stage: true }));
      updatePhase("countdown");
    }, randomDelay + 300));

    // Pro:  all fire at the same time (amberInterval = 0)
    // Full: staggered 500ms apart
    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, amber1: true }));
    }, randomDelay + 600));

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, amber2: true }));
    }, randomDelay + 600 + amberInterval));

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, amber3: true }));
    }, randomDelay + 600 + amberInterval * 2));

    // Green fires greenDelay after the LAST amber
    const lastAmberAt = randomDelay + 600 + amberInterval * 2;
    ids.push(setTimeout(() => {
      updatePhase("go");
      setTree(t => ({
        ...t,
        amber1: false,
        amber2: false,
        amber3: false,
        green: true,
      }));
      // Capture greenAt at next vsync (when pixels actually change), not at
      // state-set time. The rAF callback's `t` is performance.now()-aligned.
      // This removes ~30–40 ms of pre-paint bias from every measured RT.
      // Pre-seed with performance.now() as a safety net in case rAF is
      // delayed past an extremely fast detection (sub-16ms, never happens
      // in practice but preserves correctness).
      greenAtRef.current = performance.now();
      requestAnimationFrame((t) => {
        greenAtRef.current = t;
      });
    }, lastAmberAt + greenDelay));

    // Auto-late after 2s of green
    ids.push(setTimeout(() => {
      if (phaseRef.current === "go") {
        const rt = 2.0;
        const g = gradeRT(rt);
        setTree(t => ({ ...t, green: false }));
        recordResult(rt, g);
        updatePhase("result");
      }
    }, lastAmberAt + greenDelay + 2000));

    timerIdsRef.current = ids;
  }, [recordResult]);

  // Called by accelerometer when launch is detected.
  // candidateTime is the timestamp of the FIRST threshold-crossing reading —
  // using it here keeps RT accurate despite the 3-sample confirmation delay.
  const triggerLaunch = useCallback((candidateTime: number) => {
    if (phaseRef.current !== "go" || greenAtRef.current === null) return;
    // Guard: if onset rewind reaches back before green fired (e.g. the sensor
    // confirmation arrived just after green but the onset predates it), record
    // a red-light result inline rather than letting a negative RT through.
    // Cannot call triggerRedLight() here — it's defined after this hook and
    // its own phase guard (staging|countdown only) would reject a "go" call.
    if (candidateTime < greenAtRef.current) {
      clearTimers();
      updatePhase("redlight");
      setTree(t => ({
        ...t,
        amber1: false,
        amber2: false,
        amber3: false,
        green: false,
        red: true,
      }));
      recordResult(-0.1, "redlight");
      return;
    }
    clearTimers();
    const rt = (candidateTime - greenAtRef.current) / 1000;
    const g = gradeRT(rt);
    setTree(t => ({ ...t, green: false }));
    recordResult(rt, g);
    updatePhase("result");
  }, [recordResult]);

  // Called by accelerometer when force detected too early
  const triggerRedLight = useCallback(() => {
    const current = phaseRef.current;
    if (current !== "staging" && current !== "countdown") return;
    clearTimers();
    updatePhase("redlight");
    setTree(t => ({
      ...t,
      amber1: false,
      amber2: false,
      amber3: false,
      green: false,
      red: true,
    }));
    // Route through recordResult so series accumulation always fires.
    // Negative RT marks redlight runs unambiguously; matches gradeRT() rule.
    recordResult(-0.1, "redlight");
  }, [recordResult]);

  const switchMode = useCallback((m: TreeMode) => {
    modeRef.current = m;
    setMode(m);
    reset();
  }, [reset]);

  const isWatchingRedLight = phase === "staging" || phase === "countdown";
  const isArmed = phase === "go";

  // seriesProgress: non-null while series is active and at least one run done.
  // Computed at render time from reactive seriesCount + current refs.
  const seriesProgress = seriesEnabledRef.current && seriesCount > 0
    ? { count: seriesCount, size: seriesSizeRef.current }
    : null;

  return {
    phase,
    tree,
    mode,
    switchMode,
    reactionTime,
    grade,
    records,
    bestTime,
    startSequence,
    reset,
    clearHistory,
    triggerLaunch,
    triggerRedLight,
    isArmed,
    isWatchingRedLight,
    // Lazy accessor for the current greenAt — used by the home screen to
    // attach session context to per-launch sensor telemetry without making
    // greenAt itself reactive (it would cause needless re-renders).
    getGreenAt: () => greenAtRef.current,
    // Series mode
    setSeries,
    seriesProgress,
    seriesSummary,
  };
}
