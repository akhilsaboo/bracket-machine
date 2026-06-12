// Derives standings / third-place race / bracket from predictions using the
// validated client-side engine. Pure functions — safe to call on every keystroke.

import {
  buildRound32,
  calculateStandings,
  rankThirdPlaceTeams,
  type MatchInput,
  type StandingRow,
  type Team,
  type TeamRecord,
} from "@/lib/engine";
import { GROUP_IDS, groupFixtures, teamsInGroup } from "@/lib/data";
import { isLocked } from "@/lib/schedule";
import type { Predictions } from "@/lib/predictions";

const scored = (s: { home: number | null; away: number | null } | undefined): boolean =>
  !!s && s.home !== null && s.away !== null;

function groupMatchInputs(group: string, predictions: Predictions): MatchInput[] {
  return groupFixtures(group)
    .filter((f) => scored(predictions[f.id]))
    .map((f) => {
      const s = predictions[f.id]!;
      return { home: f.home, away: f.away, homeGoals: s.home!, awayGoals: s.away! };
    });
}

export function groupStandings(group: string, predictions: Predictions): StandingRow[] {
  return calculateStandings(teamsInGroup(group), groupMatchInputs(group, predictions));
}

export function groupIsComplete(group: string, predictions: Predictions): boolean {
  return groupFixtures(group).every((f) => scored(predictions[f.id]));
}

export function groupProgress(group: string, predictions: Predictions): [number, number] {
  const fixtures = groupFixtures(group);
  return [fixtures.filter((f) => scored(predictions[f.id])).length, fixtures.length];
}

export function allGroupsComplete(predictions: Predictions): boolean {
  return GROUP_IDS.every((g) => groupIsComplete(g, predictions));
}

type GoalResult = { homeGoals: number; awayGoals: number };

/** Fill in already-played group matches the user didn't pick (e.g. a late joiner
 *  who couldn't predict locked games) from real results, so they only need to
 *  predict what's still playable. A user's own picks ALWAYS take precedence — real
 *  results only fill gaps. Used for the completeness gate, standings, and bracket
 *  resolution; NEVER for scoring (which only grades the user's actual picks). */
export function withResults(predictions: Predictions, results: Record<string, GoalResult>): Predictions {
  const out: Predictions = { ...predictions };
  for (const [id, r] of Object.entries(results ?? {})) {
    if (!scored(out[id])) out[id] = { home: r.homeGoals, away: r.awayGoals };
  }
  return out;
}

/** Picks the user has made vs. picks still available to make. Already-played
 *  matches the user skipped are excluded from the total (they resolve from real
 *  results), so the counter reads e.g. "70/70" instead of a stuck "70/72". */
function pickCounts(fixtures: ReturnType<typeof groupFixtures>, predictions: Predictions, now: Date): [number, number] {
  let made = 0;
  let total = 0;
  for (const f of fixtures) {
    if (scored(predictions[f.id])) {
      made++;
      total++;
    } else if (!isLocked(f, now)) {
      total++; // still open to pick
    }
    // else: locked & unpicked → excluded (auto-resolves from results)
  }
  return [made, total];
}

export function pickProgress(predictions: Predictions, now: Date): [number, number] {
  return pickCounts(GROUP_IDS.flatMap((g) => groupFixtures(g)), predictions, now);
}

export function groupPickProgress(group: string, predictions: Predictions, now: Date): [number, number] {
  return pickCounts(groupFixtures(group), predictions, now);
}

export function thirdPlaceRanking(predictions: Predictions): TeamRecord[] {
  const thirds = GROUP_IDS.map((g) => groupStandings(g, predictions)[2].record);
  return rankThirdPlaceTeams(thirds);
}

export interface ResolvedFixture {
  match: number;
  homeLabel: string; // e.g. "1E"
  awayLabel: string; // e.g. "3D"
  home: Team | null;
  away: Team | null;
}

const POS_INDEX: Record<string, number> = { "1": 0, "2": 1, "3": 2 };

function resolveSlot(label: string, predictions: Predictions): Team | null {
  const idx = POS_INDEX[label[0]];
  const group = label.slice(1);
  if (idx === undefined || !GROUP_IDS.includes(group)) return null;
  return groupStandings(group, predictions)[idx]?.record.team ?? null;
}

// Round of 32 with team identities resolved. null until all groups are complete.
export function round32(predictions: Predictions): ResolvedFixture[] | null {
  if (!allGroupsComplete(predictions)) return null;
  const ranked = thirdPlaceRanking(predictions);
  const advancingGroups = ranked.slice(0, 8).map((r) => r.team.group);
  return buildRound32(advancingGroups).map((f) => ({
    match: f.match,
    homeLabel: f.home,
    awayLabel: f.away,
    home: resolveSlot(f.home, predictions),
    away: resolveSlot(f.away, predictions),
  }));
}
