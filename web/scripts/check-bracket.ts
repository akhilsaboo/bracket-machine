// Smoke-test the knockout resolution: fill every group, then pick winners all the
// way up and confirm a champion resolves with no gaps. Run: npx tsx scripts/check-bracket.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { round32 } from "../lib/compute";
import { resolveKnockout, champion, BRACKET_LAYOUT, type KnockoutWinners } from "../lib/knockout";
import type { Predictions } from "../lib/predictions";

const here = dirname(fileURLToPath(import.meta.url));
const schedule = JSON.parse(
  readFileSync(join(here, "..", "data", "schedule.json"), "utf8"),
) as { id: string }[];

// Complete every group: home wins 2-1 everywhere.
const predictions: Predictions = {};
for (const f of schedule) predictions[f.id] = { home: 2, away: 1 };

const r32 = round32(predictions);
if (!r32) throw new Error("round32 returned null despite all groups filled");
const r32Filled = r32.every((f) => f.home && f.away);
console.log(`R32: ${r32.length} fixtures, all teams resolved: ${r32Filled}`);

// Iteratively pick the home team of each resolved match (enough passes to reach the final).
const winners: KnockoutWinners = {};
const order = [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104];
for (let pass = 0; pass < 6; pass++) {
  const r = resolveKnockout(predictions, winners)!;
  for (const m of order) {
    const km = r.get(m)!;
    if (km.home && !winners[String(m)]) winners[String(m)] = km.home.code;
  }
}

const resolved = resolveKnockout(predictions, winners)!;
const champ = champion(resolved);
const gaps = order.filter((m) => {
  const km = resolved.get(m)!;
  return !km.home || !km.away;
});

console.log(`Champion: ${champ?.name ?? "NONE"}`);
console.log(`Final (104): ${resolved.get(104)!.home?.name} vs ${resolved.get(104)!.away?.name}`);
console.log(`Third place (103): ${resolved.get(103)!.home?.name} vs ${resolved.get(103)!.away?.name}`);
console.log(`Matches with an unresolved side: ${gaps.length === 0 ? "none" : gaps.join(",")}`);

if (champ && gaps.length === 0 && r32Filled) {
  console.log("PASS — full bracket resolves R32 → champion with no gaps.");
  process.exit(0);
}
console.error("FAIL — bracket did not fully resolve.");
process.exit(1);
