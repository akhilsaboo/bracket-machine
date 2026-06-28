// Score a bracket against the current set of match results.
import type { Fixture } from "@/lib/data";
import { resolveKnockout, resolveKnockoutFrom, type KOMatch } from "@/lib/knockout";
import { groupIsComplete, groupStandings, round32, withResults, type ResolvedFixture } from "@/lib/compute";
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

export type KOBucket = "r32" | "r16" | "qf" | "sf" | "third" | "champion";

function bucketOf(m: number): KOBucket | null {
  if (m >= 73 && m <= 88) return "r32";
  if (m >= 89 && m <= 96) return "r16";
  if (m >= 97 && m <= 100) return "qf";
  if (m === 101 || m === 102) return "sf";
  if (m === 103) return "third";
  if (m === 104) return "champion";
  return null;
}

/** Public alias: which KO round a match belongs to (for the stake UI / store). */
export const koBucketOf = bucketOf;

/** Double-or-Nothing stakes (second-chance brackets): at most ONE staked match per
 *  knockout round, keyed by round bucket → that round's staked match number. A
 *  staked pick that lands pays DOUBLE the round's base points; one that misses
 *  SUBTRACTS them. The third-place playoff isn't stakeable. */
export type Boosts = Partial<Record<KOBucket, number>>;

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
 *  style). The +10 EXACT bonus is NOT here — it's the R32 exact-position bonus,
 *  scored separately (see scoreExactSeeding) so it lands the moment the groups
 *  finish, not when the knockouts play. */
export function scoreKnockout(
  predictions: Predictions,
  knockout: KnockoutWinners,
  truth: TournamentTruth,
): KnockoutScore {
  const resolved = resolveKnockout(predictions, knockout);
  if (!resolved) return ZERO_KO;
  return scoreResolvedKnockout(resolved, truth);
}

/** Core advancement scoring over an already-resolved knockout map (+ Double-or-
 *  Nothing stakes for second-chance brackets). */
function scoreResolvedKnockout(
  resolved: Map<number, KOMatch>,
  truth: TournamentTruth,
  boosts?: Boosts | null,
): KnockoutScore {
  const reachers = actualReachersByBucket(truth);
  const out: KnockoutScore = { ...ZERO_KO };
  for (const m of KO_MATCHES) {
    const myWinner = resolved.get(m)?.winner?.code;
    if (!myWinner) continue;
    const b = bucketOf(m);
    if (!b) continue;
    const base = KO_POINTS_PER_MATCH[m];
    // Double-or-Nothing: this match is the user's stake for its round.
    const staked = boosts?.[b] === m;
    if (reachers[b].has(myWinner)) {
      out[b]++;
      out.points += base;
      if (staked) out.points += base; // landed → pay DOUBLE the round's base points
    } else if (staked && reachers[b].size >= ROUND_SIZE[b]) {
      // Stake missed and the round is fully resolved → lose the round's points.
      // (Gated on the round being decided so a still-alive pick isn't penalized
      // mid-round; totals are allowed to go negative.)
      out.points -= base;
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
  boosts?: Boosts | null,
): KnockoutScore {
  if (!r32 || !truth) return ZERO_KO;
  return scoreResolvedKnockout(resolveKnockoutFrom(r32, knockout), truth, boosts);
}

// ── R32 exact-position bonus ───────────────────────────────────────────────
// +10 for each Round-of-32 slot where the bracket's predicted team is the team
// REALLY in that exact slot — i.e. you called the group stage precisely enough to
// seed that team in its actual position. Lands as soon as the groups are decided
// (it's about seeding, not knockout results). Gated by exact-eligibility so a
// gap-filled late bracket (raw groups incomplete → no predicted R32) can't farm it.

export interface SeedingScore {
  points: number;
  exact: number; // # of R32 slots placed in their exact real position
}

/** The REAL Round of 32 derived from the live group truth (same seed the
 *  second-chance bracket uses). Null until all 12 groups are decided. */
export function realRound32FromTruth(truth: TournamentTruth): ResolvedFixture[] | null {
  const preds: Predictions = {};
  for (const [id, r] of Object.entries(truth.groupResults)) {
    preds[id] = { home: r.homeGoals, away: r.awayGoals };
  }
  return round32(preds);
}

// The 16 home slots and 8 of the away slots are FIXED group-position labels
// ("2A", "1E", …) that depend on ONLY that one group, so they resolve per-group —
// a partial bracket still earns the groups it completed. The other 8 away slots are
// third-place teams whose placement needs the whole-tournament picture, so those
// count only when the full bracket is predictable. ("3X" labels start with '3'.)
const POS_IDX: Record<string, number> = { "1": 0, "2": 1 };

/** The team a bracket predicts for a fixed "1X"/"2X" R32 slot — but only if that
 *  group's predictions are complete. null for third-place labels or unfinished groups. */
function predictedSlotTeam(label: string, predictions: Predictions): string | null {
  const idx = POS_IDX[label[0]];
  if (idx === undefined) return null; // "3X" → not resolvable from a single group
  const group = label.slice(1);
  if (!groupIsComplete(group, predictions)) return null;
  return groupStandings(group, predictions)[idx]?.record.team.code ?? null;
}

/** R32 slots the bracket placed exactly right, as `${matchNo}:home`/`:away` keys —
 *  used for both the score and the green +10 markers in the bracket UI. Works on
 *  partial brackets: each slot is graded independently, so completed groups count
 *  even if the rest of the bracket is unfinished. */
export function exactSeedingSlots(
  predictions: Predictions,
  truth: TournamentTruth | null,
  eligibleExact: Set<string>,
): Set<string> {
  const out = new Set<string>();
  if (!truth) return out;
  const real = realRound32FromTruth(truth); // real R32 (truth is complete): slot → team
  if (!real) return out;
  // Third-place away slots need the full predicted bracket (null on a partial one).
  const predFull = round32(predictions);
  const predFullByMatch = predFull ? new Map(predFull.map((f) => [f.match, f])) : null;

  const mark = (match: number, side: "home" | "away", realTeam: { code: string } | null, predCode: string | null) => {
    if (realTeam && predCode && predCode === realTeam.code && eligibleExact.has(realTeam.code)) {
      out.add(`${match}:${side}`);
    }
  };

  for (const f of real) {
    mark(f.match, "home", f.home, predictedSlotTeam(f.homeLabel, predictions));
    const awayPred =
      f.awayLabel[0] === "3"
        ? (predFullByMatch?.get(f.match)?.away?.code ?? null)
        : predictedSlotTeam(f.awayLabel, predictions);
    mark(f.match, "away", f.away, awayPred);
  }
  return out;
}

export function scoreExactSeeding(
  predictions: Predictions,
  truth: TournamentTruth | null,
  eligibleExact: Set<string>,
): SeedingScore {
  const exact = exactSeedingSlots(predictions, truth, eligibleExact).size;
  return { points: exact * POINTS.koExactBonus, exact };
}

export interface FullScore {
  group: BracketScore;
  ko: KnockoutScore;
  bonus: SeedingScore;
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
  const ko = truth ? scoreKnockout(withResults(predictions, truth.groupResults), knockout, truth) : ZERO_KO;
  // R32 exact-position bonus — uses the RAW predicted R32 (not gap-filled).
  const bonus = scoreExactSeeding(predictions, truth, eligibleExact);
  return { group, ko, bonus, total: group.points + ko.points + bonus.points };
}
