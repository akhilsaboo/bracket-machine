import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEAM_BY_CODE } from "@/lib/data";
import { FILL_MODES } from "@/lib/autofill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only analytics. Reads every user's data with the service role (bypasses
// RLS), so it is secret-gated — same shape as /api/admin/reset.
//   GET /api/admin/stats   with  Authorization: Bearer <ADMIN_SECRET | CRON_SECRET>
// Set ADMIN_SECRET (or reuse CRON_SECRET) in the environment to enable it.

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

const PERSONA_LABEL: Record<string, string> = Object.fromEntries(
  FILL_MODES.map((m) => [m.id, `${m.emoji} ${m.label}`]),
);

type Counter = Record<string, number>;
const bump = (c: Counter, key: string) => {
  c[key] = (c[key] ?? 0) + 1;
};
const topN = (c: Counter, n: number): { label: string; count: number }[] =>
  Object.entries(c)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);

export async function GET(req: Request) {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "ADMIN_SECRET (or CRON_SECRET) not set" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = admin();
  if (!sb) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  // Pull the rows we aggregate. Tournament-scale data (≤ tens of thousands of
  // brackets) is fine to read in full here; revisit with SQL views if it grows.
  const [profilesRes, bracketsRes, poolsRes, membersRes, picksRes] = await Promise.all([
    sb.from("profiles").select("id, created_at, email_opt_out"),
    sb.from("brackets").select("id, user_id, knockout, submitted_at, fill_mode, kind"),
    sb.from("pools").select("id, name"),
    sb.from("pool_members").select("pool_id, user_id, bracket_id"),
    sb.from("prediction_picks").select("user_id, market_key, outcome_label"),
  ]);

  const firstErr = [profilesRes, bracketsRes, poolsRes, membersRes, picksRes].find((r) => r.error);
  if (firstErr?.error) {
    return Response.json({ error: firstErr.error.message }, { status: 500 });
  }

  const profiles = profilesRes.data ?? [];
  const brackets = bracketsRes.data ?? [];
  const pools = poolsRes.data ?? [];
  const members = membersRes.data ?? [];
  const picks = picksRes.data ?? [];

  // --- Participation funnel (distinct users at each step) ---
  const usersWithBracket = new Set(brackets.map((b) => b.user_id));
  const usersWithSubmitted = new Set(
    brackets.filter((b) => b.submitted_at).map((b) => b.user_id),
  );
  const usersInPool = new Set(members.map((m) => m.user_id));
  const usersWithPicks = new Set(picks.map((p) => p.user_id));

  // --- Persona distribution (only 'normal' brackets; second-chance has no group fill) ---
  const personaCounts: Counter = {};
  for (const b of brackets) {
    if (b.kind === "second_chance") continue;
    const label = b.fill_mode ? PERSONA_LABEL[b.fill_mode] ?? b.fill_mode : "✍️ Built by hand";
    bump(personaCounts, label);
  }

  // --- Predicted champion distribution (knockout match 104 winner) ---
  const championCounts: Counter = {};
  for (const b of brackets) {
    const champ = (b.knockout as Record<string, string> | null)?.["104"];
    if (!champ) continue;
    bump(championCounts, TEAM_BY_CODE.get(champ)?.name ?? champ);
  }

  // --- Most-picked tournament winner (futures 'winner' market) ---
  const winnerPickCounts: Counter = {};
  for (const p of picks) {
    if (p.market_key !== "winner") continue;
    bump(winnerPickCounts, p.outcome_label);
  }

  // --- Top pools by member count ---
  const poolName = new Map(pools.map((p) => [p.id, p.name]));
  const poolSize: Counter = {};
  for (const m of members) bump(poolSize, m.pool_id);
  const topPools = Object.entries(poolSize)
    .map(([id, count]) => ({ label: poolName.get(id) ?? "—", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // --- Signups per day, last 14 days ---
  const byDay: Counter = {};
  const dayKey = (iso: string) => iso.slice(0, 10);
  for (const p of profiles) if (p.created_at) bump(byDay, dayKey(p.created_at));
  const signups: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    signups.push({ day: key, count: byDay[key] ?? 0 });
  }

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      totals: {
        users: profiles.length,
        brackets: brackets.length,
        submittedBrackets: brackets.filter((b) => b.submitted_at).length,
        pools: pools.length,
        memberships: members.length,
        picks: picks.length,
        emailOptOuts: profiles.filter((p) => p.email_opt_out).length,
      },
      funnel: {
        users: profiles.length,
        withBracket: usersWithBracket.size,
        withSubmitted: usersWithSubmitted.size,
        inPool: usersInPool.size,
        withPicks: usersWithPicks.size,
      },
      personas: topN(personaCounts, 12),
      champions: topN(championCounts, 12),
      winnerPicks: topN(winnerPickCounts, 12),
      topPools,
      signups,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
