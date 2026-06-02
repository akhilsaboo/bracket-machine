import { FUTURE_BY_KEY, type KalshiMarketData, type KalshiOutcome } from "@/lib/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KALSHI = "https://external-api.kalshi.com/trade-api/v2";
const CACHE_MS = 10 * 60 * 1000; // 10 min — "fresh, not live-live"
const cache = new Map<string, { data: KalshiMarketData; at: number }>();

interface RawMarket {
  ticker: string;
  yes_sub_title?: string;
  last_price?: number | null; // cents
  yes_bid?: number | null; // cents
  yes_ask?: number | null; // cents
}

// Implied probability (0..100) from the available prices, or null.
function probOf(m: RawMarket): number | null {
  if (typeof m.last_price === "number" && m.last_price > 0) return m.last_price;
  if (typeof m.yes_bid === "number" && typeof m.yes_ask === "number" && (m.yes_bid > 0 || m.yes_ask > 0)) {
    return Math.round((m.yes_bid + m.yes_ask) / 2);
  }
  if (typeof m.yes_bid === "number" && m.yes_bid > 0) return m.yes_bid;
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
      .map((m) => ({ ticker: m.ticker, label: m.yes_sub_title || m.ticker, prob: probOf(m) }))
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
