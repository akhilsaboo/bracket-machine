/**
 * ESPN-style percentile for a score within the GLOBAL field of all entries.
 *
 * Definition: the share of all entries at or below this score. The global leader
 * sits at 100% (every entry is at-or-below the max); the median is ~50%. It is a
 * percentile, NOT "percent of the leader's points" — so it carries unchanged into
 * pool leaderboards, where a pool's local #1 shows their standing vs. the whole
 * world (not necessarily 100%).
 *
 * Ties share a percentile (everyone knotted at the current top reads 100%). That's
 * correct percentile behavior; it just looks lumpy early on before scores spread.
 *
 * @param sortedScores every entry's score, sorted ASCENDING.
 * @param points       the score to rank.
 */
export function percentileOf(sortedScores: number[], points: number): number {
  const n = sortedScores.length;
  if (n === 0) return 0;
  // countAtOrBelow = first index where score > points (upper bound), via binary search.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedScores[mid] <= points) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / n) * 100);
}

/** Render a percentile as a compact label, e.g. 100 → "100%", 7 → "7%". */
export function formatPercentile(pct: number): string {
  return `${pct}%`;
}
