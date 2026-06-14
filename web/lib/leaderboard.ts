/**
 * ESPN-style percentile for a score within the GLOBAL field of all entries.
 *
 * Definition (matches ESPN): the share of all entries your score STRICTLY beats.
 * Like ESPN, nobody is ever a clean 100% — you can't beat yourself, so the leader
 * tops out at 99% (we clamp there) and the worst entry reads 0%. It's a percentile,
 * NOT "percent of the leader's points" — so it carries unchanged into pool
 * leaderboards, where a pool's local #1 shows their standing vs. the whole world
 * (not necessarily the pool's best).
 *
 * Ties share a percentile (everyone knotted at a score reads the same number).
 *
 * @param sortedScores every entry's score, sorted ASCENDING.
 * @param points       the score to rank.
 */
export function percentileOf(sortedScores: number[], points: number): number {
  const n = sortedScores.length;
  if (n === 0) return 0;
  // countStrictlyBelow = lower bound: first index whose score is >= points.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedScores[mid] < points) lo = mid + 1;
    else hi = mid;
  }
  // Clamp at 99 so, like ESPN, no bracket ever shows a perfect 100%.
  return Math.min(99, Math.round((lo / n) * 100));
}

/** Render a percentile as a compact label, e.g. 100 → "100%", 7 → "7%". */
export function formatPercentile(pct: number): string {
  return `${pct}%`;
}
