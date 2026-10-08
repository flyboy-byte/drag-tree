// Two-player head-to-head (PLAN.md idea 6).
// Pure grading for one race between two players on one phone. Tap-only —
// the accelerometer can't tell players apart.

import { gradeRT } from "@/lib/timing";
import type { ReactionGrade } from "@/components/ReactionDisplay";

export type Player = "top" | "bottom";

export interface LaneResult {
  rt: number | null;   // null = didn't go (timed out)
  grade: ReactionGrade;
}

export interface VersusResult {
  top: LaneResult;
  bottom: LaneResult;
  winner: Player | "tie" | "none";
}

// Matches the solo auto-late cutoff.
export const VERSUS_TIMEOUT = 2.0;

export type VersusPhase = "idle" | "staging" | "countdown" | "go" | "done";

// RT in seconds for a lane tap at `now` (performance.now() ms), or null if
// the tap doesn't count (not racing). Before green it's negative — how early,
// measured against the scheduled green, same as a solo red light.
export function laneRT(
  phase: VersusPhase,
  now: number,
  greenAt: number | null,
  greenScheduledAt: number | null,
): number | null {
  if (phase === "go" && greenAt !== null) return Math.max(0, (now - greenAt) / 1000);
  if ((phase === "staging" || phase === "countdown") && greenScheduledAt !== null) {
    return Math.min(-0.001, (now - greenScheduledAt) / 1000);
  }
  return null;
}

export function laneResult(rt: number | null): LaneResult {
  if (rt === null) return { rt: null, grade: "late" };
  return { rt, grade: gradeRT(rt) };
}

// Red light loses outright (first red light loses if both — the earlier one
// is more negative). Otherwise the quicker light wins; equal to the ms is a tie.
export function decideWinner(topRT: number | null, bottomRT: number | null): VersusResult {
  const top = laneResult(topRT);
  const bottom = laneResult(bottomRT);
  const tRed = top.grade === "redlight";
  const bRed = bottom.grade === "redlight";

  let winner: VersusResult["winner"];
  if (tRed && bRed) {
    winner = topRT! < bottomRT! ? "bottom" : topRT! > bottomRT! ? "top" : "tie";
  } else if (tRed) {
    winner = "bottom";
  } else if (bRed) {
    winner = "top";
  } else if (topRT === null && bottomRT === null) {
    winner = "none";
  } else if (topRT === null) {
    winner = "bottom";
  } else if (bottomRT === null) {
    winner = "top";
  } else {
    const t = Math.round(topRT * 1000);
    const b = Math.round(bottomRT * 1000);
    winner = t < b ? "top" : b < t ? "bottom" : "tie";
  }
  return { top, bottom, winner };
}

export interface VersusTally {
  top: number;
  bottom: number;
  ties: number;
}

export function addToTally(tally: VersusTally, r: VersusResult): VersusTally {
  if (r.winner === "top") return { ...tally, top: tally.top + 1 };
  if (r.winner === "bottom") return { ...tally, bottom: tally.bottom + 1 };
  if (r.winner === "tie") return { ...tally, ties: tally.ties + 1 };
  return tally;
}
