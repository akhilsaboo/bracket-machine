// AI matchup insights — shared types + client fetch helper.
// The server route (app/api/insight) generates the prediction/storylines via
// Claude and win-probabilities via The Odds API; results are cached.

export interface MatchOdds {
  home: number; // implied win probability, 0..100
  draw: number;
  away: number;
  source: string; // e.g. "The Odds API (avg of N books)"
}

export interface MatchInsight {
  /** false when no ANTHROPIC_API_KEY is configured server-side. */
  configured: boolean;
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  odds: MatchOdds | null; // null until an odds provider is wired / market exists
  prediction: string; // e.g. "Brazil edge it 2–1"
  storylines: string[]; // 2–3 short bullets
  generatedAt: string;
  error?: string;
}

const cacheKey = (home: string, away: string) => `wc2026-insight:${home}:${away}`;

/** Fetch a matchup insight, caching the result in sessionStorage so re-opening
 *  the same matchup is instant and doesn't re-hit the API. */
export async function fetchInsight(homeCode: string, awayCode: string): Promise<MatchInsight> {
  const key = cacheKey(homeCode, awayCode);
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached) as MatchInsight;
  } catch {
    // ignore storage errors
  }
  const res = await fetch(`/api/insight?home=${encodeURIComponent(homeCode)}&away=${encodeURIComponent(awayCode)}`);
  const data = (await res.json()) as MatchInsight;
  try {
    if (data.configured) sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
  return data;
}
