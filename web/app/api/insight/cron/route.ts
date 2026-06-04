import { SCHEDULE } from "@/lib/data";
import { FUTURES, ODDS_FREEZE_ISO } from "@/lib/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily background pre-generation: for matchups kicking off within the next ~48h,
// (re)generate the best-quality insight (Opus + full web search) and store it in
// the durable cache, so by the time users open them they're instant + current.
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` to cron invocations when
// CRON_SECRET is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const now = Date.now();
  const WINDOW_MS = 48 * 60 * 60 * 1000;

  const upcoming = SCHEDULE.filter((f) => {
    const iso = f.kickoffUTC ?? f.kickoff;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t > now && t - now < WINDOW_MS;
  });

  const results: { match: string; ok: boolean }[] = [];
  for (const f of upcoming) {
    try {
      const r = await fetch(`${origin}/api/insight?home=${f.home}&away=${f.away}&full=1`, {
        cache: "no-store",
      });
      results.push({ match: `${f.home}-${f.away}`, ok: r.ok });
    } catch {
      results.push({ match: `${f.home}-${f.away}`, ok: false });
    }
  }

  // Odds freeze: once we're past the freeze time, ping each futures market so the
  // route captures its one-time snapshot (idempotent — first snapshot is kept).
  let frozenMarkets = 0;
  if (now >= new Date(ODDS_FREEZE_ISO).getTime()) {
    for (const f of FUTURES) {
      try {
        const r = await fetch(`${origin}/api/kalshi?key=${f.key}`, { cache: "no-store" });
        if (r.ok) frozenMarkets++;
      } catch {
        /* ignore */
      }
    }
  }

  // Resolve prediction picks (Futures via Kalshi settled markets, Games via real
  // knockout winners) so the 🎯 leaderboard shows earned points.
  let resolved: unknown = null;
  try {
    const auth = secret ? { authorization: `Bearer ${secret}` } : undefined;
    const rr = await fetch(`${origin}/api/predictions/resolve`, { cache: "no-store", headers: auth });
    if (rr.ok) resolved = await rr.json();
  } catch {
    /* ignore */
  }

  // Pre-tournament email reminders (nudge signed-up non-submitters).
  let reminders: unknown = null;
  try {
    const auth = secret ? { authorization: `Bearer ${secret}` } : undefined;
    const rr = await fetch(`${origin}/api/reminders`, { cache: "no-store", headers: auth });
    if (rr.ok) reminders = await rr.json();
  } catch {
    /* ignore */
  }

  return Response.json(
    { window: "48h", generated: results.length, results, frozenMarkets, resolved, reminders },
    { headers: { "cache-control": "no-store" } },
  );
}
