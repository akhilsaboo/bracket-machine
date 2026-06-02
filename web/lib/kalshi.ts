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
  flagIso2: string; // ISO2 (or ENG/SCO/WLS) for the nation; "" when none
}

// Kalshi outcome label -> ISO 3166-1 alpha-2 (ENG/SCO/WLS for UK home nations).
// Covers every nation in the Winner/Host markets, including non-qualifiers.
const NATION_ISO2: Record<string, string> = {
  Spain: "ES", France: "FR", England: "ENG", Portugal: "PT", Brazil: "BR",
  Argentina: "AR", Germany: "DE", Netherlands: "NL", Norway: "NO", Morocco: "MA",
  Colombia: "CO", Belgium: "BE", Iraq: "IQ", "Congo DR": "CD", "Bosnia and Herzegovina": "BA",
  Czechia: "CZ", "Northern Ireland": "NIR", Ukraine: "UA", Turkey: "TR", Senegal: "SN",
  Sweden: "SE", Mexico: "MX", Japan: "JP", Ecuador: "EC", Switzerland: "CH",
  Austria: "AT", Uruguay: "UY", USA: "US", Croatia: "HR", Panama: "PA",
  Haiti: "HT", Curacao: "CW", "Ivory Coast": "CI", Qatar: "QA", "South Africa": "ZA",
  "Cape Verde": "CV", Algeria: "DZ", Egypt: "EG", Jordan: "JO", Uzbekistan: "UZ",
  "New Zealand": "NZ", Tunisia: "TN", "Saudi Arabia": "SA", Iran: "IR", Wales: "WLS",
  Scotland: "SCO", Romania: "RO", Paraguay: "PY", Poland: "PL", "South Korea": "KR",
  "Republic of Ireland": "IE", Ghana: "GH", Australia: "AU", Denmark: "DK", Canada: "CA",
  Italy: "IT",
};

// Player (Golden Boot / Ball / Glove / Messi-vs-Ronaldo) -> nation.
const PLAYER_ISO2: Record<string, string> = {
  "Kylian Mbappe": "FR", "Harry Kane": "ENG", "Mikel Oyarzabal": "ES", "Lionel Messi": "AR",
  "Erling Haaland": "NO", "Lamine Yamal": "ES", "Cristiano Ronaldo": "PT", "Vinicius Junior": "BR",
  Raphinha: "BR", "Ousmane Dembele": "FR", "Julian Alvarez": "AR", "Lautaro Martinez": "AR",
  "Ferran Torres": "ES", "Romelu Lukaku": "BE", "Nick Woltemade": "DE", "Matheus Cunha": "BR",
  "Luis Diaz": "CO", "Cody Gakpo": "NL", "Bruno Fernandes": "PT", Neymar: "BR",
  "Scott McTominay": "SCO", Rodrygo: "BR", "Randal Kolo Muani": "FR", Richarlison: "BR",
  "Phil Foden": "ENG", "Mohamed Salah": "EG", "Memphis Depay": "NL", "Jonathan David": "CA",
  "Son Heung-min": "KR", "Darwin Nunez": "UY", "Christian Pulisic": "US", "Bukayo Saka": "ENG",
  "Alvaro Morata": "ES", Estevao: "BR", "Jude Bellingham": "ENG", Vitinha: "PT",
  Rodri: "ES", Pedri: "ES", "Michael Olise": "FR", "Rayan Cherki": "FR",
  "Declan Rice": "ENG", "Desire Doue": "FR", "Jeremy Doku": "BE", Gavi: "ES",
  "Morgan Rogers": "ENG", Antony: "BR", "Martin Odegaard": "NO", "Joao Felix": "PT",
  "Bernardo Silva": "PT", "Kevin De Bruyne": "BE", "Nuno Mendes": "PT", Endrick: "BR",
  "Mohammed Kudus": "GH", "Joshua Kimmich": "DE", "Dani Olmo": "ES", "Joao Pedro Junqueira": "BR",
  "Florian Wirtz": "DE", "Nico Williams": "ES", "Martin Zubimendi": "ES", "Marcus Rashford": "ENG",
  "Joao Neves": "PT", "Viktor Gyokeres": "SE", "Gabriel Martinelli": "BR", "Fabian Ruiz": "ES",
  "William Saliba": "FR", "Federico Valverde": "UY", "Gabriel Magalhaes": "BR", "Alexander Isak": "SE",
  "Achraf Hakimi": "MA", "Cole Palmer": "ENG", "Bart Verbruggen": "NL", "Emiliano Martinez": "AR",
  "Unai Simon": "ES", "Mike Maignan": "FR", "Jordan Pickford": "ENG", Alisson: "BR",
  "Diogo Costa": "PT", "Thibaut Courtois": "BE", "Dominik Livakovic": "HR",
};

/** Best-effort nation flag (ISO2 / ENG-SCO-WLS) for a Kalshi outcome label. */
export function flagIso2For(label: string): string {
  const k = label.trim();
  return NATION_ISO2[k] ?? PLAYER_ISO2[k] ?? "";
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
