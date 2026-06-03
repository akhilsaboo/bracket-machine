import { SCHEDULE } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live results feed. ESPN's public FIFA World Cup scoreboard (no key) carries the
// real fixtures with FIFA-style abbreviations that match our team codes 1:1
// (verified: 72/72 group fixtures map; only Curaçao differs — CUW vs our CUR).
const ESPN =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=400";
const ALIAS: Record<string, string> = { CUW: "CUR" }; // ESPN code -> our code
const norm = (c: string | undefined) => (c ? (ALIAS[c] ?? c) : "");

interface ResultsPayload {
  groupResults: Record<string, { homeGoals: number; awayGoals: number }>;
  knockoutWinners: Record<number, string>; // Phase B — populated once KO games are real
  updatedAt: string;
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  team?: { abbreviation?: string };
}
interface EspnEvent {
  date?: string;
  status?: { type?: { state?: string } };
  competitions?: { competitors?: EspnCompetitor[] }[];
}

let cache: { data: ResultsPayload; at: number } | null = null;
const CACHE_MS = 60 * 1000; // 1 min

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return Response.json(cache.data, { headers: { "cache-control": "no-store" } });
  }

  // (home,away) team codes -> our group fixture id
  const byPair = new Map<string, string>();
  for (const f of SCHEDULE) byPair.set(`${f.home}:${f.away}`, f.id);

  const groupResults: ResultsPayload["groupResults"] = {};
  try {
    const r = await fetch(ESPN, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error(`espn ${r.status}`);
    const d = (await r.json()) as { events?: EspnEvent[] };
    // Events come chronologically. A group fixture is identified purely by its
    // (home,away) pairing — knockout events have placeholder/cross-group teams
    // that won't match. We don't date-filter (some late group games land on the
    // knockout's first UTC day) and never overwrite, so the group match — which
    // always plays before any same-teams knockout rematch — wins.
    for (const e of d.events ?? []) {
      if (e.status?.type?.state !== "post") continue; // only finished matches
      const cs = e.competitions?.[0]?.competitors ?? [];
      const home = cs.find((c) => c.homeAway === "home");
      const away = cs.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      const id = byPair.get(`${norm(home.team?.abbreviation)}:${norm(away.team?.abbreviation)}`);
      if (!id || groupResults[id]) continue; // unknown pairing, or already recorded
      const hg = parseInt(home.score ?? "", 10);
      const ag = parseInt(away.score ?? "", 10);
      if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
      groupResults[id] = { homeGoals: hg, awayGoals: ag };
    }
  } catch (e) {
    console.error("results fetch error:", e);
    if (cache) return Response.json(cache.data, { headers: { "cache-control": "no-store" } });
  }

  const data: ResultsPayload = { groupResults, knockoutWinners: {}, updatedAt: new Date().toISOString() };
  cache = { data, at: Date.now() };
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
