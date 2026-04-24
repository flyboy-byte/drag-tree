import { useState, useCallback, useRef } from "react";
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

  // Keep refs in sync
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

  const startSequence = useCallback(() => {
    clearTimers();
    setReactionTime(null);
    setGrade(null);
    greenAtRef.current = null;

    const interval = modeRef.current === "pro" ? 400 : 500;
    const randomDelay = 1500 + Math.random() * 1500;

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

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, amber1: true }));
    }, randomDelay + 600));

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, amber2: true }));
    }, randomDelay + 600 + interval));

    ids.push(setTimeout(() => {
      setTree(t => ({ ...t, amber3: true }));
    }, randomDelay + 600 + interval * 2));

    ids.push(setTimeout(() => {
      const now = performance.now();
      greenAtRef.current = now;
      updatePhase("go");
      setTree(t => ({
        ...t,
        amber1: false,
        amber2: false,
        amber3: false,
        green: true,
      }));
    }, randomDelay + 600 + interval * 3));

    // Auto-late after 1.5s of green
    ids.push(setTimeout(() => {
      if (phaseRef.current === "go") {
        const rt = 1.5;
        const g = gradeRT(rt);
        setTree(t => ({ ...t, green: false }));
        recordResult(rt, g);
        updatePhase("result");
      }
    }, randomDelay + 600 + interval * 3 + 1500));

    timerIdsRef.current = ids;
  }, [recordResult]);

  const handleLaunch = useCallback(() => {
    const currentPhase = phaseRef.current;

    if (currentPhase === "idle") {
      startSequence();
      return;
    }

    if (currentPhase === "result" || currentPhase === "redlight") {
      reset();
      return;
    }

    if (currentPhase === "staging" || currentPhase === "countdown") {
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
        reactionTime: 0,
        grade: "redlight",
        mode: modeRef.current,
      };
      setRecords(prev => [record, ...prev].slice(0, 30));
      return;
    }

    if (currentPhase === "go" && greenAtRef.current !== null) {
      clearTimers();
      const now = performance.now();
      const rt = (now - greenAtRef.current) / 1000;
      const g = gradeRT(rt);
      setTree(t => ({ ...t, green: false }));
      recordResult(rt, g);
      updatePhase("result");
    }
  }, [startSequence, reset, recordResult]);

  const switchMode = useCallback((m: TreeMode) => {
    modeRef.current = m;
    setMode(m);
    reset();
  }, [reset]);

  return {
    phase,
    tree,
    mode,
    switchMode,
    reactionTime,
    grade,
    records,
    bestTime,
    handleLaunch,
    reset,
  };
}
