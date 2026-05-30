// Core engine types. Mirrors the verified Python engine (teams.py / group_tiebreak.py).

export interface Team {
  code: string;
  name: string;
  group: string;
  fifaRank: number; // official position; LOWER is better (1 = best)
  fairPlayAvg: number; // historical fair-play prior (<= 0, closer to 0 is better)
}

export interface Cards {
  yellow: number;
  secondYellow: number; // second yellow (indirect red)
  directRed: number;
  yellowAndRed: number; // yellow followed by direct red, same player
}

export const emptyCards = (): Cards => ({
  yellow: 0,
  secondYellow: 0,
  directRed: 0,
  yellowAndRed: 0,
});

export function conductScore(c: Cards): number {
  // Non-positive; closer to zero is better.
  return c.yellow * -1 + c.secondYellow * -3 + c.directRed * -4 + c.yellowAndRed * -5;
}

export interface MatchInput {
  home: string; // team code
  away: string; // team code
  homeGoals: number;
  awayGoals: number;
  homeCards?: Cards;
  awayCards?: Cards;
}

export interface TeamRecord {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  conduct: number; // seeded from Team.fairPlayAvg; cards add on top
}

export const points = (r: TeamRecord): number => r.won * 3 + r.drawn;
export const gd = (r: TeamRecord): number => r.gf - r.ga;

export interface StandingRow {
  rank: number;
  record: TeamRecord;
}
