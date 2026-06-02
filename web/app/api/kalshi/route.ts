import { FUTURE_BY_KEY, flagIso2For, type KalshiMarketData, type KalshiOutcome } from "@/lib/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KALSHI = "https://external-api.kalshi.com/trade-api/v2";
const CACHE_MS = 10 * 60 * 1000; // 10 min — "fresh, not live-live"
const cache = new Map<string, { data: KalshiMarketData; at: number }>();

interface RawMarket {
  ticker: string;
  yes_sub_title?: string;
  // Kalshi returns prices as dollar STRINGS (e.g. "0.1800" = 18%), not ints.
  last_price_dollars?: string | null;
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
}

const num = (s?: string | null): number | null => {
  if (s == null) return null;
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
};

// Max bid/ask spread (in dollars) we'll trust as a real two-sided market. Wider
// than this = illiquid junk book (e.g. bid 0 / ask 0.97) → don't infer a price.
const MAX_SPREAD = 0.25;

// Implied probability (0..100) reflecting the LIVE market, like Kalshi's site.
// The live book is the source of truth: use the bid/ask midpoint when the spread
// is tight. last_price is only a fallback and is often stale (a thin award market
// can show a 95¢ "last" while the live book sits at 2–9¢), so we never trust it
// over a real book and reject it when it contradicts the current ask.
function probOf(m: RawMarket): number | null {
  const bid = num(m.yes_bid_dollars); // 0..1 (0 = no bid)
  const ask = num(m.yes_ask_dollars); // 0..1 (1.0 = no real offer)
  const last = num(m.last_price_dollars);

  // A genuine two-sided market with a tight spread → midpoint is the price.
  if (bid != null && ask != null && ask > 0 && ask < 1 && ask - bid <= MAX_SPREAD) {
    return Math.round(((bid + ask) / 2) * 100);
  }

  // No reliable book. Fall back to last only if it's a sane, non-stale price.
  if (last != null && last > 0 && last < 1) {
    if (ask != null && ask < 1 && last > ask + 0.1) return null; // stale vs live ask
    return Math.round(last * 100);
  }
  return null;
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const cfg = FUTURE_BY_KEY[key];
  if (!cfg) return Response.json({ error: "unknown market" }, { status: 400 });

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return Response.json(hit.data, { headers: { "cache-control": "no-store" } });
  }

  const filter = cfg.event ? `event_ticker=${cfg.event}` : `series_ticker=${cfg.series}`;
  const ident = cfg.event ?? cfg.series ?? "";
  try {
    const r = await fetch(`${KALSHI}/markets?${filter}&limit=500`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`kalshi ${r.status}`);
    const raw = (await r.json()) as { markets?: RawMarket[] };
    const markets = raw.markets ?? [];

    const outcomes: KalshiOutcome[] = markets
      .map((m) => {
        const label = m.yes_sub_title || m.ticker;
        return { ticker: m.ticker, label, prob: probOf(m), flagIso2: flagIso2For(label) };
      })
      .sort((a, b) => (b.prob ?? -1) - (a.prob ?? -1));

    const data: KalshiMarketData = {
      key,
      series: ident,
      title: cfg.title,
      binary: markets.length === 1,
      outcomes,
      fetchedAt: new Date().toISOString(),
    };
    cache.set(key, { data, at: Date.now() });
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("kalshi fetch error:", e);
    // Serve stale cache if we have it; else an empty shell.
    if (hit) return Response.json(hit.data, { headers: { "cache-control": "no-store" } });
    return Response.json(
      { key, series: ident, title: cfg.title, binary: false, outcomes: [], fetchedAt: new Date().toISOString() } satisfies KalshiMarketData,
      { headers: { "cache-control": "no-store" } },
    );
  }
}
