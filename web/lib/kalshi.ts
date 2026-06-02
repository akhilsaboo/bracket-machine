// Kalshi public market data (no key needed) for the Predictions "Futures" tab.
// We curate a list of WC markets by their real series tickers (discovered from
// https://external-api.kalshi.com/trade-api/v2/series?category=Sports).

export interface FutureConfig {
  key: string; // our stable id
  title: string;
  subtitle: string;
  series: string; // Kalshi series_ticker
  icon: string;
}

// Tickers verified live June 2026. (Golden Ball/Glove + "goal in first minute"
// had no Kalshi series at time of writing — add here if/when they appear.)
export const FUTURES: FutureConfig[] = [
  { key: "winner", title: "World Cup Winner", subtitle: "Who lifts the trophy", series: "KXMENWORLDCUP", icon: "🏆" },
  { key: "golden_boot", title: "Golden Boot", subtitle: "Top goalscorer", series: "KXWCGOALLEADER", icon: "⚽" },
  { key: "first_time_winner", title: "First-Time Winner?", subtitle: "A nation wins its first ever WC", series: "KXWC1STTIMEWIN", icon: "🌟" },
  { key: "host_furthest", title: "Furthest-Advancing Host", subtitle: "Best stage by a host nation (USA/CAN/MEX)", series: "KXWCHOSTSTAGE", icon: "🏟️" },
  { key: "messi", title: "Messi at the World Cup", subtitle: "Argentina's talisman", series: "KXSOCCERPLAYMESSI", icon: "🐐" },
  { key: "ronaldo", title: "Ronaldo at the World Cup", subtitle: "Portugal's talisman", series: "KXSOCCERPLAYCRON", icon: "🐐" },
];

export const FUTURE_BY_KEY: Record<string, FutureConfig> = Object.fromEntries(
  FUTURES.map((f) => [f.key, f]),
);

export interface KalshiOutcome {
  ticker: string; // unique market ticker — the pick id
  label: string; // yes_sub_title (team / player / "Yes")
  prob: number | null; // implied probability 0..100 (null when no price yet)
}

export interface KalshiMarketData {
  key: string;
  series: string;
  title: string;
  /** true when it's a single Yes/No market (rendered as Yes/No). */
  binary: boolean;
  outcomes: KalshiOutcome[]; // sorted by prob desc
  fetchedAt: string;
}

/** Client fetch for one future's market data (cached server-side). */
export async function fetchFuture(key: string): Promise<KalshiMarketData | null> {
  try {
    const r = await fetch(`/api/kalshi?key=${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    return (await r.json()) as KalshiMarketData;
  } catch {
    return null;
  }
}
