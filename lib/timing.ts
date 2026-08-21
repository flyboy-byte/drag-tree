import type { ReactionGrade } from "@/components/ReactionDisplay";
import type { SeriesRun, SeriesSummary } from "@/hooks/useTreeSession";

export function gradeRT(rt: number): ReactionGrade {
  if (rt < 0)      return "redlight";
  if (rt <= 0.049) return "perfect";
  if (rt <= 0.099) return "pro";
  if (rt <= 0.199) return "great";
  if (rt <= 0.349) return "good";
  return "late";
}

export function computeSeriesSummary(runs: SeriesRun[], size: number): SeriesSummary {
  const cleanTimes = runs
    .filter(r => r.grade !== "redlight" && r.reactionTime >= 0)
    .map(r => r.reactionTime);

  const avgRT = cleanTimes.length > 0
    ? cleanTimes.reduce((s, t) => s + t, 0) / cleanTimes.length
    : null;
  const bestRT  = cleanTimes.length > 0 ? Math.min(...cleanTimes) : null;
  const worstRT = cleanTimes.length > 0 ? Math.max(...cleanTimes) : null;
  const redLightCount = runs.filter(r => r.grade === "redlight").length;

  let consistency = "—";
  if (cleanTimes.length >= 3) {
    const mean = avgRT!;
    const variance = cleanTimes.reduce((s, t) => s + (t - mean) ** 2, 0) / cleanTimes.length;
    const stdDev = Math.sqrt(variance);
    const half = Math.floor(cleanTimes.length / 2);
    const firstAvg  = cleanTimes.slice(0, half).reduce((s, t) => s + t, 0) / half;
    const secondAvg = cleanTimes.slice(Math.ceil(cleanTimes.length / 2)).reduce((s, t) => s + t, 0)
      / (cleanTimes.length - Math.ceil(cleanTimes.length / 2));
    const trend = firstAvg - secondAvg;
    if (stdDev < 0.020)       consistency = "Consistent";
    else if (trend > 0.030)   consistency = "Improving";
    else if (trend < -0.030)  consistency = "Fading";
    else                      consistency = "Mixed";
  } else if (cleanTimes.length === 2) {
    const diff = cleanTimes[0] - cleanTimes[1];
    if (Math.abs(diff) < 0.020) consistency = "Consistent";
    else if (diff > 0)          consistency = "Improving";
    else                        consistency = "Fading";
  } else if (cleanTimes.length === 1) {
    consistency = "One clean run";
  } else {
    consistency = "No clean runs";
  }

  return { size, runs, avgRT, bestRT, worstRT, redLightCount, consistency };
}
