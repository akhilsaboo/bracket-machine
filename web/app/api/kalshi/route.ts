import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FUTURE_BY_KEY,
  flagIso2For,
  ODDS_FREEZE_ISO,
  type KalshiMarketData,
  type KalshiOutcome,
} from "@/lib/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KALSHI = "https://external-api.kalshi.com/trade-api/v2";
const CACHE_MS = 10 * 60 * 1000; // 10 min — "fresh, not live-live"
const FREEZE_AT = new Date(ODDS_FREEZE_ISO).getTime();
const cache = new Map<string, { data: KalshiMarketData; at: number }>();

function serverSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

async function readSnapshot(sb: SupabaseClient, key: string): Promise<KalshiMarketData | null> {
  const { data } = await sb.from("market_snapshots").select("payload").eq("key", key).maybeSingle();
  return (data?.payload as KalshiMarketData | undefined) ?? null;
}

// Capture once — ignoreDuplicates so the FIRST snapshot wins and never changes.
async function writeSnapshot(sb: SupabaseClient, key: string, payload: KalshiMarketData): Promise<void> {
  await sb
    .from("market_snapshots")
    .upsert({ key, payload, captured_at: new Date().toISOString() }, { onConflict: "key", ignoreDuplicates: true });
}

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

type Cfg = (typeof FUTURE_BY_KEY)[string];

async function fetchLive(cfg: Cfg, key: string, ident: string): Promise<KalshiMarketData> {
  const filter = cfg.event ? `event_ticker=${cfg.event}` : `series_ticker=${cfg.series}`;
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
    return {
      key,
      series: ident,
      title: cfg.title,
      binary: markets.length === 1,
      outcomes,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("kalshi fetch error:", e);
    return { key, series: ident, title: cfg.title, binary: false, outcomes: [], fetchedAt: new Date().toISOString() };
  }
}

const json = (data: KalshiMarketData) =>
  Response.json(data, { headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const cfg = FUTURE_BY_KEY[key];
  if (!cfg) return Response.json({ error: "unknown market" }, { status: 400 });
  const ident = cfg.event ?? cfg.series ?? "";

  // ── Frozen window: serve the one-time pre-tournament snapshot, never live. ──
  if (Date.now() >= FREEZE_AT) {
    const sb = serverSupabase();
    if (sb) {
      const snap = await readSnapshot(sb, key);
      if (snap) return json({ ...snap, frozen: true });
      // First request after the freeze → capture live now and lock it in.
      const live = await fetchLive(cfg, key, ident);
      if (live.outcomes.length > 0) {
        await writeSnapshot(sb, key, live);
        const stored = (await readSnapshot(sb, key)) ?? live;
        return json({ ...stored, frozen: true });
      }
      return json({ ...live, frozen: true });
    }
    // No Supabase configured — fall back to live (can't persist a snapshot).
    return json(await fetchLive(cfg, key, ident));
  }

  // ── Pre-freeze: live with a short module cache. ──
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.data);
  const data = await fetchLive(cfg, key, ident);
  if (data.outcomes.length > 0) {
    cache.set(key, { data, at: Date.now() });
    return json(data);
  }
  // Empty result — prefer a recent good cache if we have one.
  return json(hit?.data ?? data);
}
