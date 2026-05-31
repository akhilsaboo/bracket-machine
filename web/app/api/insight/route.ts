import Anthropic from "@anthropic-ai/sdk";
import { TEAM_BY_CODE } from "@/lib/data";
import type { MatchInsight, MatchOdds } from "@/lib/insights";

export const runtime = "nodejs";

// Module-level cache (per warm function instance) so a given matchup is generated
// at most once per instance per day — keeps Claude + odds calls cheap. For a
// cross-instance durable cache, back this with Supabase/Blob later.
const cache = new Map<string, { data: MatchInsight; at: number }>();
const DAY_MS = 86_400_000;

const SCHEMA = {
  type: "object",
  properties: {
    prediction: { type: "string" },
    storylines: { type: "array", items: { type: "string" } },
  },
  required: ["prediction", "storylines"],
  additionalProperties: false,
} as const;

async function generate(
  home: { name: string; fifaRank: number },
  away: { name: string; fifaRank: number },
): Promise<{ prediction: string; storylines: string[] }> {
  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system:
      "You are a concise, knowledgeable football (soccer) analyst previewing a 2026 FIFA World Cup matchup. " +
      "Give one short prediction sentence (a plausible scoreline is welcome) and 2-3 punchy storylines. " +
      "Stay grounded: reference well-known team strengths, rivalries, and star players you are confident about. " +
      "Do NOT invent specific stats, exact past results, or injury news. Each storyline under ~18 words.",
    messages: [
      {
        role: "user",
        content: `Preview ${home.name} (FIFA rank ${home.fifaRank}) vs ${away.name} (FIFA rank ${away.fifaRank}).`,
      },
    ],
    // Structured output keeps the response a clean JSON object (no rambling).
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = msg.content.find((b) => b.type === "text");
  const parsed = JSON.parse(text && "text" in text ? text.text : "{}") as {
    prediction?: string;
    storylines?: string[];
  };
  return {
    prediction: parsed.prediction ?? "",
    storylines: Array.isArray(parsed.storylines) ? parsed.storylines.slice(0, 3) : [],
  };
}

async function fetchOdds(homeName: string, awayName: string): Promise<MatchOdds | null> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${key}&regions=us&markets=h2h&oddsFormat=decimal`;
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const events = (await r.json()) as Array<{
      home_team: string;
      away_team: string;
      bookmakers: Array<{ markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }> }>;
    }>;
    const norm = (s: string) => s.toLowerCase();
    const ev = events.find(
      (e) =>
        (norm(e.home_team).includes(norm(homeName)) || norm(homeName).includes(norm(e.home_team))) &&
        (norm(e.away_team).includes(norm(awayName)) || norm(awayName).includes(norm(e.away_team))),
    );
    if (!ev) return null;
    // Average decimal odds across books for home / draw / away, then convert to
    // implied probabilities and de-vig (normalize to 100).
    const sums = { home: 0, draw: 0, away: 0 };
    let n = 0;
    for (const bk of ev.bookmakers) {
      const h2h = bk.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const get = (name: string) => h2h.outcomes.find((o) => norm(o.name) === norm(name))?.price;
      const h = get(ev.home_team);
      const a = get(ev.away_team);
      const d = h2h.outcomes.find((o) => norm(o.name) === "draw")?.price;
      if (!h || !a || !d) continue;
      sums.home += 1 / h;
      sums.away += 1 / a;
      sums.draw += 1 / d;
      n++;
    }
    if (n === 0) return null;
    const total = sums.home + sums.draw + sums.away;
    return {
      home: Math.round((sums.home / total) * 100),
      draw: Math.round((sums.draw / total) * 100),
      away: Math.round((sums.away / total) * 100),
      source: `The Odds API (avg of ${n} book${n === 1 ? "" : "s"})`,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const homeCode = (searchParams.get("home") ?? "").toUpperCase();
  const awayCode = (searchParams.get("away") ?? "").toUpperCase();
  const home = TEAM_BY_CODE.get(homeCode);
  const away = TEAM_BY_CODE.get(awayCode);

  const base = {
    homeCode,
    awayCode,
    homeName: home?.name ?? homeCode,
    awayName: away?.name ?? awayCode,
    odds: null,
    prediction: "",
    storylines: [] as string[],
    generatedAt: new Date().toISOString(),
  };

  if (!home || !away) {
    return Response.json({ ...base, configured: false, error: "Unknown teams" } satisfies MatchInsight, {
      status: 400,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ...base, configured: false } satisfies MatchInsight);
  }

  const ck = `${homeCode}:${awayCode}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < DAY_MS) return Response.json(hit.data);

  try {
    const [ai, odds] = await Promise.all([generate(home, away), fetchOdds(home.name, away.name)]);
    const data: MatchInsight = { ...base, configured: true, odds, prediction: ai.prediction, storylines: ai.storylines };
    cache.set(ck, { data, at: Date.now() });
    return Response.json(data);
  } catch (e) {
    console.error("insight generation error:", e);
    return Response.json({
      ...base,
      configured: true,
      error: "Couldn't generate an insight right now. Try again later.",
    } satisfies MatchInsight);
  }
}
