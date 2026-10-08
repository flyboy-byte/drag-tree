// Hold-and-release launch (PLAN.md idea 4).
// The driver holds a button through staging and lets go on green, like a
// trans-brake. This module is the pure decision logic; the input source is
// either the on-screen button (4a) or a hardware key (4b, see
// lib/hardwareKeys.ts).

export type HoldPhase = "staging" | "countdown" | "go";

export type HoldEvent =
  | { kind: "press" }
  | { kind: "release"; at: number };

export type HoldOutcome =
  | { kind: "none" }                // nothing to do
  | { kind: "armed" }               // held during staging — ready
  | { kind: "notHeld" }             // tree reached countdown without a hold
  | { kind: "redlight"; at: number } // let go before green
  | { kind: "launch"; at: number };  // let go after green → RT = at - greenAt

export function holdDecision(
  phase: HoldPhase,
  held: boolean,
  event: HoldEvent,
): HoldOutcome {
  if (event.kind === "press") {
    return phase === "staging" ? { kind: "armed" } : { kind: "none" };
  }
  // release
  if (!held) return { kind: "none" };
  if (phase === "go") return { kind: "launch", at: event.at };
  return { kind: "redlight", at: event.at };
}

// Called when the tree moves from staging to countdown. Without a hold the
// run can't be measured — the UI should prompt rather than start the ambers.
export function canStartCountdown(held: boolean): HoldOutcome {
  return held ? { kind: "none" } : { kind: "notHeld" };
}
