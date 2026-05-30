// Match-result types + comparison helpers + a mock generator for demo / preview.
// Once a live results data source is wired in (task #12), the same types are
// reused — only the data source changes. Components ask helpers, not the source.

import type { Fixture } from "@/lib/data";
import { isOver } from "@/lib/schedule";

export interface GroupResult {
  homeGoals: number;
  awayGoals: number;
}

export interface KnockoutResult {
  winnerCode: string;
}

export type GroupGrade = "exact" | "correct" | "wrong" | null;
export type KnockoutGrade = "correct" | "wrong" | null;

function outcome(home: number, away: number): "home" | "away" | "draw" {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

export function gradeGroup(
  prediction: { home: number | null; away: number | null } | undefined,
  result: GroupResult | undefined,
): GroupGrade {
  if (!prediction || prediction.home === null || prediction.away === null) return null;
  if (!result) return null;
  if (prediction.home === result.homeGoals && prediction.away === result.awayGoals) return "exact";
  if (outcome(prediction.home, prediction.away) === outcome(result.homeGoals, result.awayGoals)) {
    return "correct";
  }
  return "wrong";
}

export function gradeKnockout(
  predictedWinnerCode: string | undefined,
  result: KnockoutResult | undefined,
): KnockoutGrade {
  if (!predictedWinnerCode) return null;
  if (!result) return null;
  return predictedWinnerCode === result.winnerCode ? "correct" : "wrong";
}

// --- Mock results (demo only) ----------------------------------------------
// Deterministic by fixture id so the same fixture always yields the same mock.
// Used when the preview-mid-tournament toggle is on, so the UI shows the green/
// red grading even before any live data exists.

const SCORE_VARIANTS: GroupResult[] = [
  { homeGoals: 2, awayGoals: 1 },
  { homeGoals: 1, awayGoals: 0 },
  { homeGoals: 1, awayGoals: 1 },
  { homeGoals: 0, awayGoals: 2 },
  { homeGoals: 3, awayGoals: 1 },
  { homeGoals: 0, awayGoals: 0 },
];

function hashStr(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function mockGroupResult(fixture: Fixture, now: Date): GroupResult | null {
  if (!isOver(fixture, now)) return null;
  return SCORE_VARIANTS[hashStr(fixture.id) % SCORE_VARIANTS.length];
}

/** Mock knockout result: deterministically pick one of the two teams. */
export function mockKnockoutWinner(
  matchNumber: number,
  homeCode: string | null,
  awayCode: string | null,
): KnockoutResult | null {
  if (!homeCode || !awayCode) return null;
  // odd match -> home wins, even -> away wins; gives visible variety.
  return { winnerCode: matchNumber % 2 === 1 ? homeCode : awayCode };
}

// --- Tournament-start helper -----------------------------------------------
// Used to hide the preview toggle once the real tournament is underway —
// at that point, real results from the live data source will arrive naturally.
export const TOURNAMENT_START_ISO = "2026-06-11T17:00:00Z"; // a few hours before Match 1
export const KNOCKOUT_START_ISO = "2026-06-28T19:00:00Z"; // Match 73 kickoff
/** Demo "now" used by the Preview toggle — set after the Final so every grading
 *  state is visible in the demo (group, R16, QF, SF, Final, Champion). */
export const PREVIEW_NOW_ISO = "2026-07-20T00:00:00Z";

export function tournamentHasStarted(now: Date): boolean {
  return now.getTime() >= new Date(TOURNAMENT_START_ISO).getTime();
}

/** True once the Round of 32 has begun — group stage is fully in the past. */
export function isKnockoutStarted(now: Date): boolean {
  return now.getTime() >= new Date(KNOCKOUT_START_ISO).getTime();
}

// --- Tournament truth ------------------------------------------------------
// A single source-of-truth bundle used to score all brackets against the same
// outcome. In preview mode it's deterministic; once a live results source is
// wired (task #12) the same shape gets populated from the API.

import { SCHEDULE } from "@/lib/data";
import { resolveKnockout } from "@/lib/knockout";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";

export interface TournamentTruth {
  groupResults: Record<string, GroupResult>; // by fixture id
  knockoutWinners: Record<number, string>; // by match no -> team code
}

/** Construct a deterministic mock-tournament outcome for preview / demo use. */
export function buildMockTournament(now: Date): TournamentTruth {
  const groupResults: Record<string, GroupResult> = {};
  const mockPred: Predictions = {};
  for (const f of SCHEDULE) {
    const r = mockGroupResult(f, now);
    if (r) {
      groupResults[f.id] = r;
      mockPred[f.id] = { home: r.homeGoals, away: r.awayGoals };
    }
  }

  const winners: KnockoutWinners = {};
  const order = [
    73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
    89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104,
  ];
  for (const m of order) {
    const resolved = resolveKnockout(mockPred, winners);
    if (!resolved) break; // groups not all complete -> no knockout truth
    const km = resolved.get(m);
    if (!km) continue;
    const w = mockKnockoutWinner(m, km.home?.code ?? null, km.away?.code ?? null);
    if (w) winners[m.toString()] = w.winnerCode;
  }

  const numericWinners: Record<number, string> = {};
  for (const [k, v] of Object.entries(winners)) numericWinners[parseInt(k, 10)] = v;
  return { groupResults, knockoutWinners: numericWinners };
}
