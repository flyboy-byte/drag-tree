// Subtle, rare-firing coaching hints derived from recent run history.
// Returns at most ONE short string (or null). Designed to fire only when
// the user is genuinely struggling — not after a single mistake.

import type { RunRecord } from "@/hooks/useTreeSession";

export function coachingHint(records: RunRecord[]): string | null {
  if (records.length < 2) return null;

  // Note: records are stored newest-first by useTreeSession.
  const last = records[0];
  const prev = records[1];
  const prev2 = records[2];

  // Two red lights in a row → user is launching before green.
  if (last.grade === "redlight" && prev.grade === "redlight") {
    return "Wait for the green light to come on before launching.";
  }

  // Three LATE in a row → sensitivity may be too high for their car.
  if (
    prev2 &&
    last.grade === "late" &&
    prev.grade === "late" &&
    prev2.grade === "late"
  ) {
    return "Launches feel late? Try a lower sensitivity (Gentle) in Settings.";
  }

  // Two suspiciously-fast greens in a row → likely vibration false-fire.
  if (
    last.grade !== "redlight" &&
    prev.grade !== "redlight" &&
    last.reactionTime < 0.010 &&
    prev.reactionTime < 0.010
  ) {
    return "Mount your phone steady — vibration can trigger false launches.";
  }

  return null;
}
