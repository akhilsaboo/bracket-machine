// Kalshi public market data (no key needed) for the Predictions "Futures" tab.
// We curate a list of WC markets by their real series tickers (discovered from
// https://external-api.kalshi.com/trade-api/v2/series?category=Sports).

export interface FutureConfig {
  key: string; // our stable id
  title: string;
  subtitle: string;
  // Provide exactly one: a Kalshi series_ticker (whole series) or an event_ticker
  // (one event within a series, e.g. the Golden Ball event of KXWCAWARD).
  series?: string;
  event?: string;
  icon: string;
}

// Tickers verified live June 2026.
export const FUTURES: FutureConfig[] = [
  { key: "winner", title: "World Cup Winner", subtitle: "Who lifts the trophy", series: "KXMENWORLDCUP", icon: "🏆" },
  { key: "golden_boot", title: "Golden Boot", subtitle: "Top goalscorer", series: "KXWCGOALLEADER", icon: "⚽" },
  { key: "golden_ball", title: "Golden Ball", subtitle: "Best player", event: "KXWCAWARD-26GBALL", icon: "🏅" },
  { key: "golden_glove", title: "Golden Glove", subtitle: "Best goalkeeper", event: "KXWCAWARD-26GGLOVE", icon: "🧤" },
  { key: "messi_ronaldo", title: "Messi vs Ronaldo", subtitle: "More goal contributions", event: "KXWCMESSIRONALDO-26LMESCRON", icon: "🐐" },
  { key: "host_furthest", title: "Furthest-Advancing Host", subtitle: "USA / Canada / Mexico", event: "KXWCBESTHOST-26", icon: "🏟️" },
  { key: "first_time_winner", title: "First-Time Winner?", subtitle: "A nation wins its first ever WC", series: "KXWC1STTIMEWIN", icon: "🌟" },
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
