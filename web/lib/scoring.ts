// Score a bracket against the current set of match results.
import type { Fixture } from "@/lib/data";
import { resolveKnockout, resolveKnockoutFrom, type KOMatch } from "@/lib/knockout";
import { withResults, type ResolvedFixture } from "@/lib/compute";
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

/** Teams a bracket has "earned" exact-bonus eligibility for: it locked a real
 *  prediction for ≥2 of the team's 3 group games. You can only pick a group game
 *  BEFORE it kicks off, so ≥2 means you called the team's group while it was still
 *  genuinely live — not after the standings were already known. This gates the
 *  structural exact-slot bonus so a late or restarted bracket (whose group results
 *  are gap-filled from reality) can't bank slots it never actually risked. */
export function exactEligibleTeams(predictions: Predictions, fixtures: Fixture[]): Set<string> {
  const counts = new Map<string, number>();
  for (const f of fixtures) {
    if (!f.group) continue; // group-stage games only
    const p = predictions[f.id];
    if (!p || p.home === null || p.away === null) continue;
    counts.set(f.home, (counts.get(f.home) ?? 0) + 1);
    counts.set(f.away, (counts.get(f.away) ?? 0) + 1);
  }
  const eligible = new Set<string>();
  for (const [team, n] of counts) if (n >= 2) eligible.add(team);
  return eligible;
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

// Matches per knockout round — a round is "resolved" once this many winners exist.
const ROUND_SIZE: Record<KOBucket, number> = { r32: 16, r16: 8, qf: 4, sf: 2, third: 1, champion: 1 };

/** A reusable grader for the bracket display: did a picked team advance / nail
 *  the exact slot? Built once from the truth so per-slot lookups are cheap.
 *  Returns null (UNGRADED) until there's real data: a pick goes green as soon as
 *  the team actually advances, but only goes red once that round is fully
 *  resolved — so nothing grades pre-tournament or mid-round. */
export function knockoutGrader(
  truth: TournamentTruth,
): (matchNo: number, pickedCode: string | undefined) => KOPickGrade | null {
  const reachers = actualReachersByBucket(truth);
  return (matchNo, pickedCode) => {
    if (!pickedCode) return null;
    const b = bucketOf(matchNo);
    if (!b) return null;
    if (reachers[b].has(pickedCode)) {
      return { advanced: true, exact: truth.knockoutWinners[matchNo] === pickedCode };
    }
    // Not advanced → only call it wrong once the whole round has results in.
    if (reachers[b].size >= ROUND_SIZE[b]) return { advanced: false, exact: false };
    return null; // round not resolved yet → leave ungraded
  };
}

/** Advancement scoring: you earn a round's points for each team you correctly
 *  predicted to REACH that round (opponent/path doesn't matter, March-Madness
 *  style), plus a +10 bonus when that team is in the EXACT slot you predicted. */
export function scoreKnockout(
  predictions: Predictions,
  knockout: KnockoutWinners,
  truth: TournamentTruth,
  eligibleExact?: Set<string> | null,
): KnockoutScore {
  const resolved = resolveKnockout(predictions, knockout);
  if (!resolved) return ZERO_KO;
  return scoreResolvedKnockout(resolved, truth, eligibleExact);
}

/** Core advancement + exact scoring over an already-resolved knockout map. The
 *  exact-slot bonus is gated by `eligibleExact` (teams whose group you called
 *  early); pass null/undefined to ungate it (e.g. second-chance, whose structure
 *  is the REAL R32 and so can't be farmed). */
function scoreResolvedKnockout(
  resolved: Map<number, KOMatch>,
  truth: TournamentTruth,
  eligibleExact?: Set<string> | null,
): KnockoutScore {
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
    // Exact-slot bonus — only for teams the bracket earned eligibility for.
    if (truth.knockoutWinners[m] === myWinner && (!eligibleExact || eligibleExact.has(myWinner))) {
      out.exact++;
      out.points += POINTS.koExactBonus;
    }
  }
  return out;
}

/** Score a SECOND-CHANCE bracket: knockout-only (no group points), resolved from
 *  the real Round of 32 rather than the user's group predictions. */
export function scoreSecondChance(
  knockout: KnockoutWinners,
  r32: ResolvedFixture[] | null,
  truth: TournamentTruth | null,
): KnockoutScore {
  if (!r32 || !truth) return ZERO_KO;
  return scoreResolvedKnockout(resolveKnockoutFrom(r32, knockout), truth);
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
  // Group points: grade ONLY the user's own picks (no free points for games they
  // never predicted). Knockout: resolve the bracket from effective predictions
  // (real results fill matches a late joiner couldn't pick) so their KO picks
  // still resolve and score. For a full-bracket user, effective === their picks.
  const group = scoreBracket(predictions, fixtures, resultFor);
  // Exact-bonus eligibility is computed from the RAW predictions (the user's own
  // locked picks), NOT the gap-filled ones — so a bracket only earns exact slots
  // for teams whose group it actually predicted (≥2 games) before kickoff.
  const eligibleExact = exactEligibleTeams(predictions, fixtures);
  const ko = truth
    ? scoreKnockout(withResults(predictions, truth.groupResults), knockout, truth, eligibleExact)
    : ZERO_KO;
  return { group, ko, total: group.points + ko.points };
}
