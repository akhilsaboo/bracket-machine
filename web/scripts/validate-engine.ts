// Validates the TypeScript engine against golden vectors produced by the verified
// Python engine. Run: npx tsx scripts/validate-engine.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  Team,
  MatchInput,
  calculateStandings,
  rankThirdPlaceTeams,
  buildRound32,
  TeamRecord,
} from "../lib/engine/index";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const readJson = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

const teams: Team[] = readJson("teams.json");
const golden = readJson("golden_vectors.json");

const byCode = new Map(teams.map((t) => [t.code, t]));
const groupsOf = (gid: string) => teams.filter((t) => t.group === gid);

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    failures++;
    console.error(`  FAIL ${label}\n    got : ${g}\n    want: ${w}`);
  }
};

// 1. Per-group standings order.
const thirds: TeamRecord[] = [];
for (const gid of Object.keys(golden.groups)) {
  const { matches, expectedOrder } = golden.groups[gid] as {
    matches: MatchInput[];
    expectedOrder: string[];
  };
  const standings = calculateStandings(groupsOf(gid), matches);
  eq(`group ${gid} standings`, standings.map((s) => s.record.team.code), expectedOrder);
  thirds.push(standings[2].record);
}

// 2. Cross-group third-place ranking.
const ranked = rankThirdPlaceTeams(thirds);
eq("third-place ranking", ranked.map((r) => r.team.code), golden.expectedThirdOrder);

// 3. Advancing groups + R32 bracket via Annex C.
const advancingGroups = ranked.slice(0, 8).map((r) => r.team.group);
eq("advancing groups", [...advancingGroups].sort(), golden.expectedAdvancingGroups);

const r32 = buildRound32(advancingGroups);
eq(
  "round of 32",
  r32.map((f) => ({ match: f.match, home: f.home, away: f.away })),
  golden.expectedR32,
);

if (failures === 0) {
  console.log(`PASS — TS engine matches Python golden vectors (${teams.length} teams, 12 groups, R32).`);
  process.exit(0);
} else {
  console.error(`\n${failures} mismatch(es) — TS port diverges from Python.`);
  process.exit(1);
}
