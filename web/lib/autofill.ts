// Auto-fill engine: turns a chosen "mode" (quick pick or AI persona) into a set
// of group-stage scorelines the user can then edit. Knockout auto-pick is a
// follow-up (see project_autofill_agents). Everything here is deterministic and
// client-side — no backend, no real LLM call (personas are branded heuristics).

import { SCHEDULE, TEAM_BY_CODE } from "@/lib/data";
import type { Predictions } from "@/lib/predictions";

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
    description: "Random but plausible scorelines and winners across the whole group stage.",
    emoji: "🎲",
    implemented: false,
  },
  {
    id: "purist",
    kind: "persona",
    label: "The Statistical Purist",
    tagline: "Trust the numbers, ignore the heart.",
    description:
      "Leans on rankings, Elo and odds. Never calls an upset unless the data demands it — the baseline everyone has to beat.",
    emoji: "🤓",
    implemented: false,
  },
  {
    id: "chaos_agent",
    kind: "persona",
    label: "The Chaos Agent",
    tagline: "The world loves an underdog.",
    description:
      "Triggers upsets every round, targeting aging or drama-filled giants and sending dark-horse minnows deep.",
    emoji: "🃏",
    implemented: false,
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
      "For the non-fan: picks on cooler kits, better food, nicer flags. Gloriously unpredictable.",
    emoji: "🎨",
    implemented: false,
  },
  {
    id: "nostalgist",
    kind: "persona",
    label: "The Historic Nostalgist",
    tagline: "Never count out the giants.",
    description:
      "Weighs World Cup legacy and trophies above current form. Football royalty advances.",
    emoji: "🏛️",
    implemented: false,
  },
];

export const FILL_MODE_BY_ID: Record<FillModeId, FillMode> = Object.fromEntries(
  FILL_MODES.map((m) => [m.id, m]),
) as Record<FillModeId, FillMode>;

export interface FillOptions {
  /** Home nation team code — required by the Patriot persona. */
  nation?: string;
}

// All group-stage fixtures (matchday 1–3, real schedule has `group` set).
const GROUP_FIXTURES = SCHEDULE.filter((f) => f.group && f.group.length === 1);

function rankOf(code: string): number {
  return TEAM_BY_CODE.get(code)?.fifaRank ?? 999;
}

/**
 * Deterministic "chalk" scoreline: the better-ranked team wins, by a margin that
 * grows with the ranking gap. No draws — keeps it firmly on the favorites.
 */
function chalkScore(homeCode: string, awayCode: string): { home: number; away: number } {
  const homeRank = rankOf(homeCode);
  const awayRank = rankOf(awayCode);
  const gap = Math.abs(homeRank - awayRank);

  let winnerGoals: number;
  let loserGoals: number;
  if (gap >= 30) [winnerGoals, loserGoals] = [3, 0];
  else if (gap >= 15) [winnerGoals, loserGoals] = [2, 0];
  else if (gap >= 5) [winnerGoals, loserGoals] = [2, 1];
  else [winnerGoals, loserGoals] = [1, 0];

  // Lower fifaRank is better. Tie on rank → home edge.
  const homeWins = homeRank <= awayRank;
  return homeWins
    ? { home: winnerGoals, away: loserGoals }
    : { home: loserGoals, away: winnerGoals };
}

/**
 * Build the full set of group-stage scorelines for a mode. Only `chalk` is wired
 * today; other modes throw so the UI can keep them in a "coming soon" state.
 */
export function buildGroupPredictions(mode: FillModeId, _opts: FillOptions = {}): Predictions {
  const out: Predictions = {};
  switch (mode) {
    case "chalk":
      for (const f of GROUP_FIXTURES) {
        out[f.id] = chalkScore(f.home, f.away);
      }
      return out;
    default:
      throw new Error(`Auto-fill mode "${mode}" is not implemented yet`);
  }
}
