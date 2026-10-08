// Two-player head-to-head session (PLAN.md idea 6).
// One shared tree, two lanes. Each lane's first tap is its launch; a tap
// before green is that lane's red light. The race ends when both lanes have
// gone or 2 s after green. Results feed an in-memory tally only — never the
// solo history or personal best.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TreeState } from "@/components/ChristmasTree";
import type { TreeMode } from "@/hooks/useTreeSession";
import {
  laneRT,
  decideWinner,
  addToTally,
  VERSUS_TIMEOUT,
  type Player,
  type VersusPhase,
  type VersusResult,
  type VersusTally,
} from "@/lib/versus";

const INITIAL_TREE: TreeState = {
  preStage: false, stage: false, amber1: false, amber2: false, amber3: false, green: false, red: false,
};

type Lanes = Record<Player, number | null>;
const EMPTY_LANES: Lanes = { top: null, bottom: null };

export function useVersusSession(mode: TreeMode) {
  const [phase, setPhase] = useState<VersusPhase>("idle");
  const [tree, setTree] = useState<TreeState>(INITIAL_TREE);
  const [lanes, setLanes] = useState<Lanes>(EMPTY_LANES);
  const [result, setResult] = useState<VersusResult | null>(null);
  const [tally, setTally] = useState<VersusTally>({ top: 0, bottom: 0, ties: 0 });

  const phaseRef = useRef<VersusPhase>("idle");
  const lanesRef = useRef<Lanes>(EMPTY_LANES);
  const greenAtRef = useRef<number | null>(null);
  const greenScheduledAtRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  useEffect(() => clearTimers, []);

  const updatePhase = (p: VersusPhase) => { phaseRef.current = p; setPhase(p); };

  const finish = useCallback(() => {
    if (phaseRef.current === "done") return;
    clearTimers();
    updatePhase("done");
    setTree(t => ({ ...t, green: false }));
    const r = decideWinner(lanesRef.current.top, lanesRef.current.bottom);
    setResult(r);
    setTally(prev => addToTally(prev, r));
  }, []);

  const start = useCallback(() => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "done") return;
    clearTimers();
    lanesRef.current = EMPTY_LANES;
    setLanes(EMPTY_LANES);
    setResult(null);
    greenAtRef.current = null;
    setTree(INITIAL_TREE);
    updatePhase("staging");

    // Same timing as a solo run (see useTreeSession.startSequence).
    const seqStart = performance.now();
    const randomDelay = 1500 + Math.random() * 1500;
    const isPro = mode === "pro";
    const amberInterval = isPro ? 0 : 500;
    const greenDelay = isPro ? 400 : 500;
    const lastAmberAt = randomDelay + 600 + amberInterval * 2;
    greenScheduledAtRef.current = seqStart + lastAmberAt + greenDelay;

    const at = (ms: number, fn: () => void) => timersRef.current.push(setTimeout(fn, ms));
    at(randomDelay, () => setTree(t => ({ ...t, preStage: true })));
    at(randomDelay + 300, () => { setTree(t => ({ ...t, stage: true })); updatePhase("countdown"); });
    at(randomDelay + 600, () => setTree(t => ({ ...t, amber1: true })));
    at(randomDelay + 600 + amberInterval, () => setTree(t => ({ ...t, amber2: true })));
    at(lastAmberAt, () => setTree(t => ({ ...t, amber3: true })));
    at(lastAmberAt + greenDelay, () => {
      // Both lanes red-lit already — nothing left to race.
      if (phaseRef.current !== "countdown" && phaseRef.current !== "staging") return;
      updatePhase("go");
      setTree(t => ({ ...t, amber1: false, amber2: false, amber3: false, green: true }));
      greenAtRef.current = performance.now();
      requestAnimationFrame(t => { greenAtRef.current = t; });
    });
    at(lastAmberAt + greenDelay + VERSUS_TIMEOUT * 1000, finish);
  }, [mode, finish]);

  // Returns the lane's RT if this tap counted, else null.
  const tap = useCallback((player: Player, now: number): number | null => {
    if (lanesRef.current[player] !== null) return null;
    const rt = laneRT(phaseRef.current, now, greenAtRef.current, greenScheduledAtRef.current);
    if (rt === null) return null;
    const next = { ...lanesRef.current, [player]: rt };
    lanesRef.current = next;
    setLanes(next);
    const other: Player = player === "top" ? "bottom" : "top";
    const otherRT = next[other];
    // Race is over once both lanes have gone, or once one red-lights and the
    // other has also gone (or red-lit).
    if (otherRT !== null) finish();
    return rt;
  }, [finish]);

  const resetTally = useCallback(() => setTally({ top: 0, bottom: 0, ties: 0 }), []);

  return { phase, tree, lanes, result, tally, start, tap, resetTally };
}
