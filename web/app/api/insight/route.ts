import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { SCHEDULE, TEAM_BY_CODE } from "@/lib/data";
import type { MatchInsight, MatchOdds } from "@/lib/insights";

export const runtime = "nodejs";

const FRESH_MS = 86_400_000; // regenerate an upcoming matchup at most once / 24h

function sbServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

/** Kickoff time for a group matchup (knockout teams aren't in the static schedule). */
function kickoffOf(homeCode: string, awayCode: string): Date | null {
  const f = SCHEDULE.find((x) => x.home === homeCode && x.away === awayCode);
  const iso = f?.kickoffUTC ?? f?.kickoff ?? null;
  return iso ? new Date(iso) : null;
}

/** Remove web-search citation tags (e.g. <cite index="3-3">…</cite>) but keep the text. */
const stripCitations = (s: string) =>
  s
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

/** Pull the JSON object out of a model response (handles code fences / stray text). */
function parseInsightJson(text: string): { prediction: string; storylines: string[]; recap: string } {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  const p = JSON.parse(t) as { prediction?: string; storylines?: string[]; recap?: string };
  return {
    prediction: p.prediction ?? "",
    storylines: Array.isArray(p.storylines) ? p.storylines.slice(0, 3) : [],
    recap: p.recap ?? "",
  };
}

async function generate(
  home: { name: string; fifaRank: number },
  away: { name: string; fifaRank: number },
  live: boolean,
): Promise<{ prediction: string; storylines: string[]; recap: string }> {
  const anthropic = new Anthropic();

  // Only web-search when the match is near (current info exists and matters);
  // otherwise generate fast from the model's own knowledge.
  const research = live
    ? "First, use web search to check each team's recent form, key available players, and any notable news. Then "
    : "Drawing on these teams' well-known style, strengths, rivalries, and star players, ";

  const system =
    "You are a concise, knowledgeable football (soccer) analyst previewing a 2026 FIFA World Cup matchup. " +
    research +
    "respond with ONLY a JSON object (no prose before or after, no code fences) of the exact shape: " +
    `{"prediction": string, "storylines": string[], "recap": string}. ` +
    "prediction = one short sentence (a plausible scoreline is welcome). " +
    "storylines = 2-3 punchy bullets, each under ~18 words. " +
    "recap = a spoken-word preview of about 60-75 words (~30 seconds read aloud), conversational like a broadcaster's intro. " +
    "Do not fabricate specific stats, exact past results, or injuries you aren't sure of.";

  const userPrompt = `Preview ${home.name} (FIFA rank ${home.fifaRank}) vs ${away.name} (FIFA rank ${away.fifaRank}) at the 2026 World Cup.`;

  const params = {
    // Haiku 4.5 = the fast model (no "fast Opus 4.8" exists); great for short previews.
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system,
    ...(live ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }] } : {}),
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  // Server-side web search may need re-prompting on pause_turn; loop a few times.
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  let resp = await anthropic.messages.create({ ...params, messages });
  let guard = 0;
  while (resp.stop_reason === "pause_turn" && guard++ < 3) {
    messages = [{ role: "user", content: userPrompt }, { role: "assistant", content: resp.content }];
    resp = await anthropic.messages.create({ ...params, messages });
  }

  // Find the text block that contains the JSON (prefer the last).
  const texts = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
  for (const t of texts.reverse()) {
    try {
      const r = parseInsightJson(t);
      return {
        prediction: stripCitations(r.prediction),
        storylines: r.storylines.map(stripCitations),
        recap: stripCitations(r.recap),
      };
    } catch {
      // try the next text block
    }
  }
  throw new Error("no parseable insight JSON in response");
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
    recap: "",
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

  const key = `${homeCode}:${awayCode}`;
  const sb = sbServer();
  const kickoff = kickoffOf(homeCode, awayCode);

  // Durable cache: one stored insight per matchup, shared across everyone.
  // Fresh if the match has already kicked off (freeze it) or it was generated
  // within the last 24h; otherwise regenerate so upcoming matches stay current.
  if (sb) {
    const { data: row } = await sb.from("match_insights").select("payload, generated_at").eq("key", key).maybeSingle();
    if (row?.payload) {
      const age = Date.now() - new Date(row.generated_at as string).getTime();
      const started = kickoff ? Date.now() >= kickoff.getTime() : false;
      if (started || age < FRESH_MS) return Response.json(row.payload as MatchInsight);
    }
  }

  // Web-search only when the match is within ~4 days (and not yet started) — keeps
  // far-off insights fast, and near-match ones current.
  const live =
    !!kickoff && kickoff.getTime() > Date.now() && kickoff.getTime() - Date.now() < 4 * FRESH_MS;

  try {
    const [ai, odds] = await Promise.all([generate(home, away, live), fetchOdds(home.name, away.name)]);
    const data: MatchInsight = {
      ...base,
      configured: true,
      odds,
      prediction: ai.prediction,
      storylines: ai.storylines,
      recap: ai.recap,
    };
    if (sb) {
      await sb.from("match_insights").upsert({ key, payload: data, generated_at: new Date().toISOString() });
    }
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
