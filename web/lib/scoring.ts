// Score a bracket against the current set of match results.
import type { Fixture } from "@/lib/data";
import { resolveKnockout } from "@/lib/knockout";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";
import { gradeGroup, type GroupResult, type TournamentTruth } from "@/lib/results";

export const POINTS = {
  // Group stage (per match prediction)
  groupExact: 10, // both winner AND scoreline right
  groupCorrect: 5, // right outcome only (winner/draw)
  // Knockout (per match — pick the winner of that match)
  koR32: 20,
  koR16: 40,
  koQF: 80,
  koSF: 160,
  koThird: 160, // third-place playoff
  koChampion: 320, // the Final itself
  koExactBonus: 10, // bonus when the team is in the EXACT predicted bracket slot
} as const;

// Per-match knockout point lookup — derived from POINTS so it stays consistent.
const KO_POINTS_PER_MATCH: Record<number, number> = (() => {
  const map: Record<number, number> = {};
  for (let m = 73; m <= 88; m++) map[m] = POINTS.koR32;
  for (let m = 89; m <= 96; m++) map[m] = POINTS.koR16;
  for (let m = 97; m <= 100; m++) map[m] = POINTS.koQF;
  map[101] = POINTS.koSF;
  map[102] = POINTS.koSF;
  map[103] = POINTS.koThird;
  map[104] = POINTS.koChampion;
  return map;
})();

const KO_MATCHES = Object.keys(KO_POINTS_PER_MATCH).map(Number);

export interface BracketScore {
  points: number;
  graded: number; // number of group matches that had a result and a prediction
  correct: number; // exact + correct count
  exact: number;
  /** 0..100, share of graded picks that were exact or correct. */
  percent: number;
}

export function scoreBracket(
  predictions: Predictions,
  fixtures: Fixture[],
  resultFor: (fixture: Fixture) => GroupResult | null,
): BracketScore {
  let points = 0;
  let graded = 0;
  let correct = 0;
  let exact = 0;
  for (const f of fixtures) {
    const result = resultFor(f);
    if (!result) continue;
    const p = predictions[f.id];
    if (!p || p.home === null || p.away === null) continue;
    const g = gradeGroup(p, result);
    if (!g) continue;
    graded++;
    if (g === "exact") {
      exact++;
      correct++;
      points += POINTS.groupExact;
    } else if (g === "correct") {
      correct++;
      points += POINTS.groupCorrect;
    }
  }
  const percent = graded === 0 ? 0 : Math.round((correct / graded) * 100);
  return { points, graded, correct, exact, percent };
}

export interface KnockoutScore {
  points: number;
  r32: number;
  r16: number;
  qf: number;
  sf: number;
  third: number;
  champion: number;
  exact: number; // number of exact-position bonuses earned
}

const ZERO_KO: KnockoutScore = {
  points: 0,
  r32: 0,
  r16: 0,
  qf: 0,
  sf: 0,
  third: 0,
  champion: 0,
  exact: 0,
};

type KOBucket = "r32" | "r16" | "qf" | "sf" | "third" | "champion";

function bucketOf(m: number): KOBucket | null {
  if (m >= 73 && m <= 88) return "r32";
  if (m >= 89 && m <= 96) return "r16";
  if (m >= 97 && m <= 100) return "qf";
  if (m === 101 || m === 102) return "sf";
  if (m === 103) return "third";
  if (m === 104) return "champion";
  return null;
}

/** Round point value for a given knockout match number. */
export function knockoutPointsForMatch(m: number): number {
  return KO_POINTS_PER_MATCH[m] ?? 0;
}

/** Teams that actually reached (i.e. won a match in) each knockout round. */
function actualReachersByBucket(truth: TournamentTruth): Record<KOBucket, Set<string>> {
  const out: Record<KOBucket, Set<string>> = {
    r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), third: new Set(), champion: new Set(),
  };
  for (const [noStr, code] of Object.entries(truth.knockoutWinners)) {
    const b = bucketOf(Number(noStr));
    if (b && code) out[b].add(code);
  }
  return out;
}

export interface KOPickGrade {
  advanced: boolean; // the picked team really reached this round (regardless of opponent)
  exact: boolean; // ...and won this exact bracket slot in reality (+bonus)
}

/** A reusable grader for the bracket display: did a picked team advance / nail
 *  the exact slot? Built once from the truth so per-slot lookups are cheap. */
export function knockoutGrader(
  truth: TournamentTruth,
): (matchNo: number, pickedCode: string | undefined) => KOPickGrade | null {
  const reachers = actualReachersByBucket(truth);
  return (matchNo, pickedCode) => {
    if (!pickedCode) return null;
    const b = bucketOf(matchNo);
    if (!b) return null;
    return {
      advanced: reachers[b].has(pickedCode),
      exact: truth.knockoutWinners[matchNo] === pickedCode,
    };
  };
}

/** Advancement scoring: you earn a round's points for each team you correctly
 *  predicted to REACH that round (opponent/path doesn't matter, March-Madness
 *  style), plus a +10 bonus when that team is in the EXACT slot you predicted. */
export function scoreKnockout(
  predictions: Predictions,
  knockout: KnockoutWinners,
  truth: TournamentTruth,
): KnockoutScore {
  const resolved = resolveKnockout(predictions, knockout);
  if (!resolved) return ZERO_KO;
  const reachers = actualReachersByBucket(truth);
  const out: KnockoutScore = { ...ZERO_KO };
  for (const m of KO_MATCHES) {
    const myWinner = resolved.get(m)?.winner?.code;
    if (!myWinner) continue;
    const b = bucketOf(m);
    if (!b) continue;
    if (reachers[b].has(myWinner)) {
      out[b]++;
      out.points += KO_POINTS_PER_MATCH[m];
    }
    if (truth.knockoutWinners[m] === myWinner) {
      out.exact++;
      out.points += POINTS.koExactBonus;
    }
  }
  return out;
}

export interface FullScore {
  group: BracketScore;
  ko: KnockoutScore;
  total: number;
}

export function scoreEverything(
  predictions: Predictions,
  knockout: KnockoutWinners,
  fixtures: Fixture[],
  resultFor: (f: Fixture) => GroupResult | null,
  truth: TournamentTruth | null,
): FullScore {
  const group = scoreBracket(predictions, fixtures, resultFor);
  const ko = truth ? scoreKnockout(predictions, knockout, truth) : ZERO_KO;
  return { group, ko, total: group.points + ko.points };
}
