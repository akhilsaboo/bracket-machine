import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FUTURES } from "@/lib/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resolution job: settle prediction_picks.correct so the per-pool 🎯 leaderboard
// shows EARNED (not just potential) points.
//   • Futures  — read Kalshi settled markets (the winning outcome's market has
//                result="yes"; binary settles "yes"/"no").
//   • Games    — compare to the real knockout winners from /api/results.
// Writes need the service role key (bypasses RLS); the GET is cron-gated. A
// read-only ?dry=1 reports what WOULD resolve without writing.
const KALSHI = "https://external-api.kalshi.com/trade-api/v2";

interface RawMarket {
  ticker: string;
  result?: string; // "" until settled, then "yes" | "no"
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

// Set correct = (outcome_ticker === winner) for every pick of a resolved market.
async function settleMarket(sb: SupabaseClient, marketKey: string, winningTicker: string) {
  await sb.from("prediction_picks").update({ correct: true }).eq("market_key", marketKey).eq("outcome_ticker", winningTicker);
  await sb.from("prediction_picks").update({ correct: false }).eq("market_key", marketKey).neq("outcome_ticker", winningTicker);
}

/** The winning outcome ticker for a futures market, or null if not settled yet. */
async function futuresWinner(cfg: (typeof FUTURES)[number]): Promise<string | null> {
  const filter = cfg.event ? `event_ticker=${cfg.event}` : `series_ticker=${cfg.series}`;
  const ident = cfg.event ?? cfg.series ?? "";
  const r = await fetch(`${KALSHI}/markets?${filter}&limit=500`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const markets = ((await r.json()) as { markets?: RawMarket[] }).markets ?? [];
  if (markets.length === 1) {
    const m = markets[0];
    if (m.result === "yes") return m.ticker; // binary Yes wins
    if (m.result === "no") return `${ident}-NO`; // binary No wins
    return null;
  }
  return markets.find((m) => m.result === "yes")?.ticker ?? null; // multi: the "yes" one
}

export async function GET(req: Request) {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const secret = process.env.CRON_SECRET;
  if (!dry && secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = dry ? null : adminClient();
  if (!dry && !sb) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { headers: { "cache-control": "no-store" } });
  }

  const origin = new URL(req.url).origin;
  const futures: { key: string; winner: string }[] = [];
  const games: { match: number; winner: string }[] = [];

  // --- Futures (Kalshi settled) ---
  for (const cfg of FUTURES) {
    try {
      const winner = await futuresWinner(cfg);
      if (!winner) continue;
      if (sb) await settleMarket(sb, cfg.key, winner);
      futures.push({ key: cfg.key, winner });
    } catch (e) {
      console.error("resolve futures", cfg.key, e);
    }
  }

  // --- Games (real knockout winners) ---
  try {
    const rr = await fetch(`${origin}/api/results`, { cache: "no-store" });
    if (rr.ok) {
      const kw = ((await rr.json()) as { knockoutWinners?: Record<string, string> }).knockoutWinners ?? {};
      for (const [no, code] of Object.entries(kw)) {
        if (sb) await settleMarket(sb, `game:${no}`, code);
        games.push({ match: Number(no), winner: code });
      }
    }
  } catch (e) {
    console.error("resolve games", e);
  }

  return Response.json(
    { dry, futuresResolved: futures.length, gamesResolved: games.length, futures, games },
    { headers: { "cache-control": "no-store" } },
  );
}
