// Auto-fill engine: turns a chosen "mode" (quick pick or AI persona) into a set
// of group-stage scorelines the user can then edit. Knockout auto-pick is a
// follow-up (see project_autofill_agents). Everything here is deterministic and
// client-side — no backend, no real LLM call (personas are branded heuristics).

import { SCHEDULE, TEAM_BY_CODE } from "@/lib/data";
import type { Team } from "@/lib/engine";
import { round32 } from "@/lib/compute";
import { KO_FEEDS } from "@/lib/knockout";
import { legacyScore } from "@/lib/historicWC";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";

export type FillModeId =
  | "chalk"
  | "chaos"
  | "purist"
  | "chaos_agent"
  | "patriot"
  | "fifa_gamer"
  | "vibe"
  | "nostalgist";

export interface FillMode {
  id: FillModeId;
  kind: "quick" | "persona";
  label: string;
  /** The one-line "vibe" hook. */
  tagline: string;
  /** 1–2 sentence description of how it picks. */
  description: string;
  emoji: string;
  /** Persona needs the user to choose their home nation first. */
  needsNation?: boolean;
  /** False = listed but not wired yet (shows "coming soon"). */
  implemented: boolean;
}

// Order matters for display. Quick picks first, then the 6 AI personas.
export const FILL_MODES: FillMode[] = [
  {
    id: "chalk",
    kind: "quick",
    label: "Chalk",
    tagline: "Favorites all the way.",
    description: "Higher FIFA-ranked team wins every match. The safe, by-the-book bracket.",
    emoji: "📊",
    implemented: true,
  },
  {
    id: "chaos",
    kind: "quick",
    label: "Chaos",
    tagline: "Roll the dice.",
    description: "Random but plausible scorelines and winners across the whole bracket.",
    emoji: "🎲",
    implemented: true,
  },
  {
    id: "purist",
    kind: "persona",
    label: "The Statistical Purist",
    tagline: "Trust the numbers, ignore the heart.",
    description:
      "Leans on the FIFA rankings. Never calls an upset unless the gap demands it — the baseline everyone has to beat.",
    emoji: "🤓",
    implemented: true,
  },
  {
    id: "chaos_agent",
    kind: "persona",
    label: "The Chaos Agent",
    tagline: "The world loves an underdog.",
    description:
      "Triggers upsets every round, targeting aging or drama-filled giants and sending dark-horse minnows deep.",
    emoji: "🃏",
    implemented: true,
  },
  {
    id: "patriot",
    kind: "persona",
    label: "The Overconfident Patriot",
    tagline: "Football's coming home!",
    description:
      "Pick your nation and they win every single match, logic be damned. Pure fan-fiction hope.",
    emoji: "🏆",
    needsNation: true,
    implemented: false,
  },
  {
    id: "fifa_gamer",
    kind: "persona",
    label: "The FIFA Gamer",
    tagline: "They've got 90 pace on Ultimate Team.",
    description:
      "Ranks teams by star-player ratings and hype, not tactics. Loves the flashy superstar squads.",
    emoji: "🎮",
    implemented: false,
  },
  {
    id: "vibe",
    kind: "persona",
    label: "The Vibe Archivist",
    tagline: "I like their jerseys.",
    description:
      "For the non-fan: a stable, gloriously arbitrary vibe ranking. (Flag/kit picker coming soon.)",
    emoji: "🎨",
    implemented: true,
  },
  {
    id: "nostalgist",
    kind: "persona",
    label: "The Historic Nostalgist",
    tagline: "Never count out the giants.",
    description:
      "Weighs World Cup legacy and trophies above current form. Football royalty advances.",
    emoji: "🏛️",
    implemented: true,
  },
];

export const FILL_MODE_BY_ID: Record<FillModeId, FillMode> = Object.fromEntries(
  FILL_MODES.map((m) => [m.id, m]),
) as Record<FillModeId, FillMode>;

export interface FillOptions {
  /** Home nation team code — required by the Patriot persona. */
  nation?: string;
}

/**
 * A persona/mode = a strategy. `score` picks a group-stage scoreline; `pickWinner`
 * picks the winner of a knockout tie. Adding a persona means adding a strategy
 * here and flipping its `implemented` flag above. (Deterministic, client-side —
 * see feedback_persona_engine_decision.)
 */
export interface FillStrategy {
  score: (home: Team, away: Team, opts: FillOptions) => { home: number; away: number };
  pickWinner: (a: Team, b: Team, opts: FillOptions) => Team;
}

// All group-stage fixtures (single-letter group; knockout fixtures have none).
const GROUP_FIXTURES = SCHEDULE.filter((f) => f.group && f.group.length === 1);
const KO_ORDER = [89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104];

const better = (a: Team, b: Team): Team => (a.fifaRank <= b.fifaRank ? a : b);
type Line = { home: number; away: number };

/**
 * A favorite-wins scoreline whose margin grows with the strength `gap`. When
 * `allowDraw` and the gap is tiny, returns a level draw instead.
 */
function favoredScore(homeFavored: boolean, gap: number, allowDraw = false): Line {
  if (allowDraw && gap <= 3) return { home: 1, away: 1 };
  let w: number;
  let l: number;
  if (gap >= 30) [w, l] = [3, 0];
  else if (gap >= 15) [w, l] = [2, 0];
  else if (gap >= 5) [w, l] = [2, 1];
  else [w, l] = [1, 0];
  return homeFavored ? { home: w, away: l } : { home: l, away: w };
}

/** Chalk: better FIFA rank wins, no draws. */
function chalkScore(home: Team, away: Team): Line {
  return favoredScore(home.fifaRank <= away.fifaRank, Math.abs(home.fifaRank - away.fifaRank));
}

// Weighted toward realistic low scorelines; tops out at 5 (per the spec).
const GOAL_WEIGHTS = [0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5];
const randomGoals = (): number => GOAL_WEIGHTS[Math.floor(Math.random() * GOAL_WEIGHTS.length)];

// Stable per-team "vibe" in 0..99 — openly arbitrary (not real aesthetic data).
// Placeholder until the interactive flag/jersey picker lands (see task #7).
function vibeScore(code: string): number {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 100;
}

const STRATEGIES: Partial<Record<FillModeId, FillStrategy>> = {
  // Chalk: pure FIFA rank, favorites win.
  chalk: { score: chalkScore, pickWinner: better },

  // Chaos: random plausible scoreline, coin-flip winner.
  chaos: {
    score: () => ({ home: randomGoals(), away: randomGoals() }),
    pickWinner: (a, b) => (Math.random() < 0.5 ? a : b),
  },

  // Statistical Purist: rankings-driven, no upsets, but level teams can draw.
  purist: {
    score: (home, away) =>
      favoredScore(
        home.fifaRank <= away.fifaRank,
        Math.abs(home.fifaRank - away.fifaRank),
        true,
      ),
    pickWinner: better,
  },

  // Chaos Agent: the anti-chalk — the worse-ranked underdog advances, by slim
  // upset margins.
  chaos_agent: {
    score: (home, away) => favoredScore(home.fifaRank > away.fifaRank, 8),
    pickWinner: (a, b) => (a.fifaRank >= b.fifaRank ? a : b),
  },

  // Historic Nostalgist: World Cup legacy beats current form; ranking breaks ties.
  nostalgist: {
    score: (home, away) => {
      const lh = legacyScore(home.code);
      const la = legacyScore(away.code);
      if (lh === la) return chalkScore(home, away);
      const diff = Math.abs(lh - la);
      const gap = diff >= 10 ? 30 : diff >= 4 ? 15 : 5;
      return favoredScore(lh > la, gap);
    },
    pickWinner: (a, b) => {
      const la = legacyScore(a.code);
      const lb = legacyScore(b.code);
      if (la === lb) return better(a, b);
      return la > lb ? a : b;
    },
  },

  // Vibe Archivist: stable per-team "vibe" decides everything. For fun only.
  vibe: {
    score: (home, away) =>
      favoredScore(vibeScore(home.code) >= vibeScore(away.code), Math.abs(vibeScore(home.code) - vibeScore(away.code)) / 3),
    pickWinner: (a, b) => (vibeScore(a.code) >= vibeScore(b.code) ? a : b),
  },
};

const teamOf = (code: string): Team | undefined => TEAM_BY_CODE.get(code);

/**
 * Build the full set of group-stage scorelines for a mode. Throws for modes whose
 * strategy isn't wired yet so the UI can keep them in a "coming soon" state.
 */
export function buildGroupPredictions(mode: FillModeId, opts: FillOptions = {}): Predictions {
  const strat = STRATEGIES[mode];
  if (!strat) throw new Error(`Auto-fill mode "${mode}" is not implemented yet`);
  const out: Predictions = {};
  for (const f of GROUP_FIXTURES) {
    const home = teamOf(f.home);
    const away = teamOf(f.away);
    if (home && away) out[f.id] = strat.score(home, away, opts);
  }
  return out;
}

/**
 * Walk the knockout tree, picking each tie with the mode's strategy. Needs a
 * complete group stage (round32 resolves from standings); returns {} otherwise.
 */
export function buildKnockoutWinners(
  mode: FillModeId,
  predictions: Predictions,
  opts: FillOptions = {},
): KnockoutWinners {
  const strat = STRATEGIES[mode];
  if (!strat) return {};
  const r32 = round32(predictions);
  if (!r32) return {};

  const winners: KnockoutWinners = {};
  const winnerOf = new Map<number, Team>();
  const loserOf = new Map<number, Team>();

  const decide = (m: number, home: Team | null, away: Team | null) => {
    if (!home || !away) return;
    const w = strat.pickWinner(home, away, opts);
    winners[String(m)] = w.code;
    winnerOf.set(m, w);
    loserOf.set(m, w.code === home.code ? away : home);
  };

  for (const fx of r32) decide(fx.match, fx.home, fx.away);
  for (const m of KO_ORDER) {
    const [fh, fa] = KO_FEEDS[m];
    const pool = m === 103 ? loserOf : winnerOf;
    decide(m, pool.get(fh) ?? null, pool.get(fa) ?? null);
  }
  return winners;
}
