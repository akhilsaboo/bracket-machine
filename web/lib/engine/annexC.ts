// Round-of-32 allocation — port of lookup_table.py.
// The 8 third-place slots are filled from FIFA's official 495-row Annex C table
// (data/annexC.json). The bipartite-matching solver is kept only as a fallback.

import annexCData from "../../data/annexC.json";

const annexCMatrix = annexCData as unknown as Record<string, Record<string, string>>;

export type AwaySlot = string | { third: true; eligible: string[] };

export interface ScheduleEntry {
  match: number;
  home: string; // resolved slot label like "2A" / "1E"
  away: AwaySlot;
}

const T = (eligible: string): AwaySlot => ({ third: true, eligible: eligible.split("") });

// Real fixed Round-of-32 schedule (matches 73-88), verified against FIFA/Wikipedia.
export const ROUND_OF_32_SCHEDULE: ScheduleEntry[] = [
  { match: 73, home: "2A", away: "2B" },
  { match: 74, home: "1E", away: T("ABCDF") },
  { match: 75, home: "1F", away: "2C" },
  { match: 76, home: "1C", away: "2F" },
  { match: 77, home: "1I", away: T("CDFGH") },
  { match: 78, home: "2E", away: "2I" },
  { match: 79, home: "1A", away: T("CEFHI") },
  { match: 80, home: "1L", away: T("EHIJK") },
  { match: 81, home: "1D", away: T("BEFIJ") },
  { match: 82, home: "1G", away: T("AEHIJ") },
  { match: 83, home: "2K", away: "2L" },
  { match: 84, home: "1H", away: "2J" },
  { match: 85, home: "1B", away: T("EFGIJ") },
  { match: 86, home: "1J", away: "2H" },
  { match: 87, home: "1K", away: T("DEIJL") },
  { match: 88, home: "2D", away: "2G" },
];

export interface ThirdSlot {
  match: number;
  winner: string;
  eligible: string[];
}

export const THIRD_PLACE_SLOTS: ThirdSlot[] = ROUND_OF_32_SCHEDULE.filter(
  (e): e is ScheduleEntry & { away: { third: true; eligible: string[] } } =>
    typeof e.away !== "string" && e.away.third,
).map((e) => ({ match: e.match, winner: e.home, eligible: e.away.eligible }));

export function combinationKey(thirdPlaceGroups: string[]): string {
  if (thirdPlaceGroups.length !== 8) {
    throw new Error(`expected 8 third-placed groups, got ${thirdPlaceGroups.length}`);
  }
  return [...thirdPlaceGroups].sort().join("");
}

// Deterministic fallback: perfect bipartite matching of third-group -> eligible slot.
export function solveAssignment(thirdPlaceGroups: string[]): Map<number, string> {
  const groups = [...thirdPlaceGroups].sort();
  const slots = [...THIRD_PLACE_SLOTS].sort((a, b) => a.match - b.match);
  const slotToGroup = new Map<number, string>();

  const augment = (group: string, visited: Set<number>): boolean => {
    for (const slot of slots) {
      if (!slot.eligible.includes(group) || visited.has(slot.match)) continue;
      visited.add(slot.match);
      const occupant = slotToGroup.get(slot.match);
      if (occupant === undefined || augment(occupant, visited)) {
        slotToGroup.set(slot.match, group);
        return true;
      }
    }
    return false;
  };

  for (const g of groups) {
    if (!augment(g, new Set())) throw new Error(`no valid Round-of-32 slot for third group ${g}`);
  }
  return new Map([...slotToGroup.entries()].sort((a, b) => a[0] - b[0]));
}

// Prefer official Annex C; fall back to the solver only if a combo is missing.
export function assignThirdPlaces(
  thirdPlaceGroups: string[],
  matrix: Record<string, Record<string, string>> = annexCMatrix,
): Map<number, string> {
  const key = combinationKey(thirdPlaceGroups);
  const row = matrix[key];
  if (row) {
    return new Map(Object.entries(row).map(([m, g]) => [Number(m), g]));
  }
  return solveAssignment(thirdPlaceGroups);
}

export interface Fixture {
  match: number;
  home: string; // e.g. "1E"
  away: string; // e.g. "3D"
}

export function buildRound32(
  thirdPlaceGroups: string[],
  matrix: Record<string, Record<string, string>> = annexCMatrix,
): Fixture[] {
  const assignment = assignThirdPlaces(thirdPlaceGroups, matrix);
  return ROUND_OF_32_SCHEDULE.map((e) => ({
    match: e.match,
    home: e.home,
    away: typeof e.away === "string" ? e.away : `3${assignment.get(e.match)}`,
  }));
}
