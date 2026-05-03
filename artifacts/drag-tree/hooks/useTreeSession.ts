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
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    updatePhase("idle");
    setTree(INITIAL_TREE);
    setReactionTime(null);
    setGrade(null);
    greenAtRef.current = null;
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
    setGrade("redlight");
    setReactionTime(-0.1);
    setTree(t => ({
      ...t,
      amber1: false,
      amber2: false,
      amber3: false,
      green: false,
      red: true,
    }));
    const record: RunRecord = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      // Negative RT marks redlight runs unambiguously; matches gradeRT() rule
      // and the live setReactionTime(-0.1) above, so history sorts and any
      // future analytics treat redlights consistently.
      reactionTime: -0.1,
      grade: "redlight",
      mode: modeRef.current,
    };
    setRecords(prev => [record, ...prev].slice(0, 30));
  }, []);

  // Manual tap fallback (for web / no sensor)
  const handleManualLaunch = useCallback(() => {
    const current = phaseRef.current;
    if (current === "idle") {
      startSequence();
      return;
    }
    if (current === "result" || current === "redlight") {
      reset();
      return;
    }
    if (current === "staging" || current === "countdown") {
      triggerRedLight();
      return;
    }
    if (current === "go") {
      triggerLaunch(performance.now());
    }
  }, [startSequence, reset, triggerRedLight, triggerLaunch]);

  const switchMode = useCallback((m: TreeMode) => {
    modeRef.current = m;
    setMode(m);
    reset();
  }, [reset]);

  const isWatchingRedLight = phase === "staging" || phase === "countdown";
  const isArmed = phase === "go";

  return {
    phase,
    tree,
    mode,
    switchMode,
    reactionTime,
    grade,
    records,
    bestTime,
    handleManualLaunch,
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
  };
}
