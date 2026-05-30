// FIFA World Cup group tiebreaker engine — faithful port of group_tiebreak.py.
// Validated against the Python engine via golden vectors (see scripts/validate-engine.ts).

import {
  Cards,
  MatchInput,
  StandingRow,
  Team,
  TeamRecord,
  conductScore,
  gd,
  points,
} from "./types";

type Records = Map<string, TeamRecord>;

function newRecord(team: Team, conduct: number): TeamRecord {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, conduct };
}

function accumulate(records: Records, matches: MatchInput[]): void {
  for (const m of matches) {
    const h = records.get(m.home)!;
    const a = records.get(m.away)!;
    h.played++;
    a.played++;
    h.gf += m.homeGoals;
    h.ga += m.awayGoals;
    a.gf += m.awayGoals;
    a.ga += m.homeGoals;
    if (m.homeCards) h.conduct += conductScore(m.homeCards as Cards);
    if (m.awayCards) a.conduct += conductScore(m.awayCards as Cards);
    if (m.homeGoals > m.awayGoals) {
      h.won++;
      a.lost++;
    } else if (m.homeGoals < m.awayGoals) {
      a.won++;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
    }
  }
}

export function buildRecords(teams: Team[], matches: MatchInput[]): Records {
  // Conduct is seeded with each team's historical fair-play prior; explicit
  // per-match cards (if any) add on top. Score-only sims keep conduct == prior.
  const records: Records = new Map();
  for (const t of teams) records.set(t.code, newRecord(t, t.fairPlayAvg));
  const relevant = matches.filter((m) => records.has(m.home) && records.has(m.away));
  accumulate(records, relevant);
  return records;
}

function h2hRecords(codes: string[], full: Records, matches: MatchInput[]): Records {
  const codeSet = new Set(codes);
  const sub: Records = new Map();
  for (const c of codes) sub.set(c, newRecord(full.get(c)!.team, 0));
  accumulate(
    sub,
    matches.filter((m) => codeSet.has(m.home) && codeSet.has(m.away)),
  );
  return sub;
}

// Lexicographic compare of numeric tuples (Python tuple semantics).
function cmpKey(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// Sort descending by key (mirrors Python sorted(..., reverse=True); stable).
function sortDesc<T>(items: T[], key: (t: T) => number[]): T[] {
  return [...items].sort((x, y) => cmpKey(key(y), key(x)));
}

// Sort descending, then group runs of equal keys (Python _bucket_by_key).
function bucketByKey(codes: string[], key: (c: string) => number[]): string[][] {
  const ordered = sortDesc(codes, key);
  const buckets: string[][] = [];
  for (const c of ordered) {
    const last = buckets[buckets.length - 1];
    if (last && cmpKey(key(last[0]), key(c)) === 0) last.push(c);
    else buckets.push([c]);
  }
  return buckets;
}

// STEP 1 — recursive head-to-head (Art. 13.5(d) re-application).
function resolveHeadToHead(codes: string[], full: Records, matches: MatchInput[]): string[][] {
  if (codes.length === 1) return [codes];
  const h2h = h2hRecords(codes, full, matches);
  const key = (c: string): number[] => {
    const r = h2h.get(c)!;
    return [points(r), gd(r), r.gf];
  };
  const buckets = bucketByKey(codes, key);
  if (buckets.length === 1) return [[...codes]];
  const blocks: string[][] = [];
  for (const bucket of buckets) blocks.push(...resolveHeadToHead(bucket, full, matches));
  return blocks;
}

// STEP 2 + STEP 3 — global metrics then FIFA ranking (unique => total order).
function resolveGlobal(codes: string[], full: Records): string[] {
  const key = (c: string): number[] => {
    const r = full.get(c)!;
    return [gd(r), r.gf, r.conduct, -r.team.fifaRank];
  };
  return sortDesc(codes, key);
}

function breakTie(codes: string[], full: Records, matches: MatchInput[]): string[] {
  const ordered: string[] = [];
  for (const block of resolveHeadToHead(codes, full, matches)) {
    if (block.length === 1) ordered.push(...block);
    else ordered.push(...resolveGlobal(block, full));
  }
  return ordered;
}

export function calculateStandings(teams: Team[], matches: MatchInput[]): StandingRow[] {
  const records = buildRecords(teams, matches);
  const codes = teams.map((t) => t.code);
  const byPoints = bucketByKey(codes, (c) => [points(records.get(c)!)]);
  const finalOrder: string[] = [];
  for (const cluster of byPoints) {
    if (cluster.length === 1) finalOrder.push(...cluster);
    else finalOrder.push(...breakTie(cluster, records, matches));
  }
  return finalOrder.map((c, i) => ({ rank: i + 1, record: records.get(c)! }));
}

// Cross-group third-place ranking (no head-to-head; teams never met).
export function rankThirdPlaceTeams(thirds: TeamRecord[]): TeamRecord[] {
  const key = (r: TeamRecord): number[] => [
    points(r),
    gd(r),
    r.gf,
    r.conduct,
    -r.team.fifaRank,
  ];
  return [...thirds].sort((a, b) => cmpKey(key(b), key(a)));
}
