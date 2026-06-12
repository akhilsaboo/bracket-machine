import { SCHEDULE } from "@/lib/data";
import { allGroupsComplete, round32 } from "@/lib/compute";
import { resolveKnockoutFrom } from "@/lib/knockout";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";

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
  groupResults: Record<string, { homeGoals: number; awayGoals: number }>; // FINISHED (final)
  liveResults: Record<string, { homeGoals: number; awayGoals: number }>; // IN-PROGRESS (provisional)
  knockoutWinners: Record<number, string>; // Phase B — populated once KO games are real
  updatedAt: string;
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  winner?: boolean;
  team?: { abbreviation?: string };
}
interface EspnEvent {
  date?: string;
  status?: { type?: { state?: string } };
  competitions?: { competitors?: EspnCompetitor[] }[];
}

// Knockout match numbers in dependency order: R32 (73-88) resolve from the R32,
// then each later round once its feeders are known (3rd-place + final last).
const KO_ORDER = [
  73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104,
];
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

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
  const liveResults: ResultsPayload["liveResults"] = {};
  // Knockout winner by team-pair (real KO matches — pairing NOT in the group set).
  const koWinnerByPair = new Map<string, string>();
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
      const state = e.status?.type?.state;
      if (state !== "post" && state !== "in") continue; // finished or in-progress
      const cs = e.competitions?.[0]?.competitors ?? [];
      const home = cs.find((c) => c.homeAway === "home");
      const away = cs.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      const hc = norm(home.team?.abbreviation);
      const ac = norm(away.team?.abbreviation);
      const groupId = byPair.get(`${hc}:${ac}`);
      if (groupId) {
        const hg = parseInt(home.score ?? "", 10);
        const ag = parseInt(away.score ?? "", 10);
        if (Number.isNaN(hg) || Number.isNaN(ag)) continue;
        if (state === "post") {
          if (!groupResults[groupId]) groupResults[groupId] = { homeGoals: hg, awayGoals: ag };
        } else {
          // In-progress: record the current (provisional) score so a user joining
          // mid-game isn't blocked. Final result lands in groupResults at full time.
          liveResults[groupId] = { homeGoals: hg, awayGoals: ag };
        }
      } else if (hc && ac && state === "post") {
        // Not a group fixture → a finished knockout match. Record the winner (ESPN
        // marks the winning competitor, so ET/penalties are handled for us).
        const wc = home.winner ? hc : away.winner ? ac : null;
        if (wc) koWinnerByPair.set(pairKey(hc, ac), wc);
      }
    }
  } catch (e) {
    console.error("results fetch error:", e);
    if (cache) return Response.json(cache.data, { headers: { "cache-control": "no-store" } });
  }

  // Resolve knockout winners by match number: once all groups are in we know the
  // real R32, then we walk the bracket and match each tie to a played KO result.
  const knockoutWinners: Record<number, string> = {};
  const preds: Predictions = {};
  for (const [id, res] of Object.entries(groupResults)) preds[id] = { home: res.homeGoals, away: res.awayGoals };
  if (allGroupsComplete(preds)) {
    const r32 = round32(preds);
    if (r32) {
      const winners: KnockoutWinners = {};
      for (const m of KO_ORDER) {
        const km = resolveKnockoutFrom(r32, winners).get(m);
        if (!km?.home || !km?.away) continue;
        const w = koWinnerByPair.get(pairKey(km.home.code, km.away.code));
        if (w) winners[String(m)] = w;
      }
      for (const [k, v] of Object.entries(winners)) knockoutWinners[parseInt(k, 10)] = v;
    }
  }

  // A match can't be both finished and live — drop any live entry that has finalized.
  for (const id of Object.keys(groupResults)) delete liveResults[id];
  const data: ResultsPayload = { groupResults, liveResults, knockoutWinners, updatedAt: new Date().toISOString() };
  cache = { data, at: Date.now() };
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
