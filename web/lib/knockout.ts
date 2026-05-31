// Knockout bracket tree (matches 89-104) + resolution. Verified vs FIFA/Wikipedia.
// R32 (73-88) teams come from the group stage via Annex C (see compute.round32).
// Later rounds are filled by the user's click-picks (knockoutWinners).

import type { Team } from "@/lib/engine";
import { round32, type ResolvedFixture } from "@/lib/compute";
import type { Predictions } from "@/lib/predictions";

export type KnockoutWinners = Record<string, string>; // matchNo -> team code

// [feedHome, feedAway] — the matches whose WINNERS play (except 103 = losers).
export const KO_FEEDS: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  103: [101, 102], // losers
  104: [101, 102], // winners
};

// Two-sided bracket layout (top-to-bottom order within each column).
export const BRACKET_LAYOUT = {
  left: { R32: [74, 77, 73, 75, 83, 84, 81, 82], R16: [89, 90, 93, 94], QF: [97, 98], SF: [101] },
  right: { R32: [76, 78, 79, 80, 86, 88, 85, 87], R16: [91, 92, 95, 96], QF: [99, 100], SF: [102] },
  final: 104,
  third: 103,
};

export interface KOMatch {
  match: number;
  home: Team | null;
  away: Team | null;
  winner: Team | null;
}

const codeMatches = (t: Team | null, code: string | undefined) => !!t && t.code === code;

export function resolveKnockout(
  predictions: Predictions,
  winners: KnockoutWinners,
): Map<number, KOMatch> | null {
  const r32 = round32(predictions);
  if (!r32) return null;
  return resolveKnockoutFrom(r32, winners);
}

/** Resolve the knockout tree from a fixed Round of 32 (e.g. the real R32 for a
 *  second-chance bracket) plus the user's winner picks. */
export function resolveKnockoutFrom(
  r32: ResolvedFixture[],
  winners: KnockoutWinners,
): Map<number, KOMatch> {
  const resolved = new Map<number, KOMatch>();

  const pickWinner = (m: number, home: Team | null, away: Team | null): Team | null => {
    const code = winners[String(m)];
    if (codeMatches(home, code)) return home;
    if (codeMatches(away, code)) return away;
    return null; // unpicked or stale pick (upstream changed)
  };

  // Round of 32: teams from the group stage.
  for (const fx of r32) {
    const winner = pickWinner(fx.match, fx.home, fx.away);
    resolved.set(fx.match, { match: fx.match, home: fx.home, away: fx.away, winner });
  }

  const winnerOf = (m: number) => resolved.get(m)?.winner ?? null;
  const loserOf = (m: number): Team | null => {
    const r = resolved.get(m);
    if (!r || !r.winner || !r.home || !r.away) return null;
    return r.winner.code === r.home.code ? r.away : r.home;
  };

  // Everything else, in dependency order.
  for (const m of [89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104]) {
    const [fh, fa] = KO_FEEDS[m];
    const home = m === 103 ? loserOf(fh) : winnerOf(fh);
    const away = m === 103 ? loserOf(fa) : winnerOf(fa);
    const winner = pickWinner(m, home, away);
    resolved.set(m, { match: m, home, away, winner });
  }

  return resolved;
}

export const champion = (resolved: Map<number, KOMatch> | null): Team | null =>
  resolved?.get(104)?.winner ?? null;
