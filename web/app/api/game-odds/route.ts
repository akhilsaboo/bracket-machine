import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { round32 } from "@/lib/compute";
import { resolveKnockoutFrom } from "@/lib/knockout";
import type { Predictions } from "@/lib/predictions";
import koSchedule from "@/data/knockout_schedule.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live "to advance" odds for the knockout games, from Kalshi's KXWCADVANCE series
// (binary per team; the ticker's last segment is the FIFA code, which equals our
// team codes). Each game's odds LOCK ~24h before its kickoff: the first request
// after that captures the live price into a shared snapshot, so the point values
// are stable for the final day and everyone scores at the same number. Before the
// lock, odds are live (10-min cached). Keyed by team code — each team is in exactly
// one knockout game at a time, so it's unambiguous.

const KALSHI = "https://external-api.kalshi.com/trade-api/v2";
const SERIES = "KXWCADVANCE";
const LIVE_CACHE_MS = 10 * 60 * 1000;
const FREEZE_LEAD_MS = 24 * 60 * 60 * 1000; // lock a game's odds 24h before kickoff
const MAX_SPREAD = 0.25;
const SNAPSHOT_KEY = "gameodds";

function serverSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

interface RawMarket {
  ticker: string;
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
  last_price_dollars?: string | null;
}
const num = (s?: string | null): number | null => {
  if (s == null) return null;
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
};
// Implied probability (0..100): bid/ask midpoint when the book is tight, else a
// sane last price. Mirrors /api/kalshi probOf so games + futures read odds alike.
function probOf(m: RawMarket): number | null {
  const bid = num(m.yes_bid_dollars);
  const ask = num(m.yes_ask_dollars);
  const last = num(m.last_price_dollars);
  if (bid != null && ask != null && ask > 0 && ask < 1 && ask - bid <= MAX_SPREAD) {
    return Math.round(((bid + ask) / 2) * 100);
  }
  if (last != null && last > 0 && last < 1) {
    if (ask != null && ask < 1 && last > ask + 0.1) return null;
    return Math.round(last * 100);
  }
  return null;
}

let liveCache: { at: number; odds: Record<string, number> } | null = null;

async function fetchLiveOdds(): Promise<Record<string, number>> {
  if (liveCache && Date.now() - liveCache.at < LIVE_CACHE_MS) return liveCache.odds;
  const odds: Record<string, number> = {};
  try {
    const r = await fetch(`${KALSHI}/markets?series_ticker=${SERIES}&status=open&limit=400`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (r.ok) {
      const markets = ((await r.json()) as { markets?: RawMarket[] }).markets ?? [];
      for (const m of markets) {
        const code = m.ticker.split("-").pop(); // KXWCADVANCE-<date><pair>-<CODE>
        const p = probOf(m);
        if (code && p != null) odds[code] = p;
      }
    }
  } catch (e) {
    console.error("game-odds kalshi fetch error:", e);
  }
  // Don't cache an empty pull over a good one.
  if (Object.keys(odds).length > 0 || !liveCache) liveCache = { at: Date.now(), odds };
  return liveCache.odds;
}

// matchNo -> kickoff (ms). From the fixed knockout schedule.
const KICKOFF_MS: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (const e of koSchedule as { no: number; kickoffUTC: string }[]) {
    const t = Date.parse(e.kickoffUTC);
    if (Number.isFinite(t)) m[e.no] = t;
  }
  return m;
})();

/** team code -> kickoff (ms) for its current knockout game, from the real bracket. */
async function codeKickoffs(origin: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const j = (await (await fetch(`${origin}/api/results`, { cache: "no-store" })).json()) as {
      groupResults?: Record<string, { homeGoals: number; awayGoals: number }>;
      knockoutWinners?: Record<string, string>;
    };
    const preds: Predictions = {};
    for (const [id, r] of Object.entries(j.groupResults ?? {})) preds[id] = { home: r.homeGoals, away: r.awayGoals };
    const r32 = round32(preds);
    if (!r32) return out;
    const resolved = resolveKnockoutFrom(r32, j.knockoutWinners ?? {});
    for (const [no, match] of resolved) {
      const ko = KICKOFF_MS[no];
      if (!ko) continue;
      if (match.home) out[match.home.code] = ko;
      if (match.away) out[match.away.code] = ko;
    }
  } catch (e) {
    console.error("game-odds bracket error:", e);
  }
  return out;
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const [live, kickoffs] = await Promise.all([fetchLiveOdds(), codeKickoffs(origin)]);
  const now = Date.now();

  // Per-game freeze: lock each team's odds once it's within 24h of kickoff. The
  // locked values live in one shared snapshot that accumulates as games approach.
  const sb = serverSupabase();
  let frozen: Record<string, number> = {};
  if (sb) {
    const { data } = await sb.from("market_snapshots").select("payload").eq("key", SNAPSHOT_KEY).maybeSingle();
    frozen = ((data?.payload as { odds?: Record<string, number> } | undefined)?.odds) ?? {};
    let changed = false;
    for (const [code, prob] of Object.entries(live)) {
      const ko = kickoffs[code];
      if (ko && now >= ko - FREEZE_LEAD_MS && frozen[code] === undefined) {
        frozen[code] = prob; // capture-once at the 24h mark
        changed = true;
      }
    }
    if (changed) {
      await sb.from("market_snapshots").upsert(
        { key: SNAPSHOT_KEY, payload: { odds: frozen }, captured_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    }
  }

  const odds: Record<string, number> = {};
  const isFrozen: Record<string, boolean> = {};
  for (const code of new Set([...Object.keys(live), ...Object.keys(frozen)])) {
    const f = frozen[code];
    odds[code] = f !== undefined ? f : live[code];
    isFrozen[code] = f !== undefined;
  }

  return Response.json({ odds, frozen: isFrozen, fetchedAt: new Date().toISOString() }, {
    headers: { "cache-control": "no-store" },
  });
}
