// Seed a SANDBOX Supabase project with fake players for a demo / screen recording.
//
//   npx tsx scripts/seed-demo.ts
//
// What it does (service-role key bypasses RLS):
//   1. Creates ~8 fake auth users (confirmed, shared demo password).
//   2. Gives each a display name + a full, distinct bracket — built by running a
//      different auto-fill persona through the real engine (lib/autofill.ts), so
//      predictions and predicted champions vary realistically instead of looking
//      copy-pasted.
//   3. Creates one pool, adds every fake user as a member with their bracket
//      attributed, and prints the invite code so you can join as yourself on camera.
//   4. (opt-in, SEED_PICKS=1) seeds one futures pick per user so the 🎯 leaderboard
//      isn't empty.
//
// SAFETY: this writes fake users. It loads creds from `.env.seed` (NOT `.env.local`,
// which currently points at production) and HARD-REFUSES to run against the known
// production host. Create a throwaway Supabase project, run lib/supabase/schema.sql
// in it, and put its URL + service-role key in web/.env.seed before running.
//
// To wipe the sandbox between takes: POST /api/admin/reset?data=1 against it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildGroupPredictions, buildKnockoutWinners, type FillModeId } from "@/lib/autofill";
import { TEAM_BY_CODE } from "@/lib/data";
import { pointsFor } from "@/lib/predictionPicks";

// ── Never let this touch production ────────────────────────────────────────────
const PROD_HOSTS = ["ftnfcncrcgkrhpjpchsg.supabase.co"];
const DEMO_PASSWORD = "demo-bracket-2026";
const POOL_NAME = "The Office League";

// ── Minimal .env loader (no dependency; reads a single file) ────────────────────
function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// ── The cast. Distinct persona per player → distinct bracket. ───────────────────
interface Player {
  email: string;
  name: string;
  persona: FillModeId;
  nation?: string; // for the Patriot persona
}
const PLAYERS: Player[] = [
  { email: "alex@demo.test", name: "Alex Rivera", persona: "purist" },
  { email: "sam@demo.test", name: "Sam Chen", persona: "chaos_agent" },
  { email: "jordan@demo.test", name: "Jordan Blake", persona: "nostalgist" },
  { email: "taylor@demo.test", name: "Taylor Quinn", persona: "fifa_gamer" },
  { email: "morgan@demo.test", name: "Morgan Lee", persona: "vibe" },
  { email: "casey@demo.test", name: "Casey Flores", persona: "patriot", nation: "USA" },
  { email: "drew@demo.test", name: "Drew Martin", persona: "patriot", nation: "MEX" },
  { email: "riley@demo.test", name: "Riley Osei", persona: "chaos_agent" },
];

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envFile = process.env.SEED_ENV_FILE ?? join(here, "..", ".env.seed");
  const env = { ...loadEnv(envFile), ...process.env };

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !serviceKey) {
    console.error(
      `Missing creds. Put NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${envFile}\n` +
        "(the service-role key is under Supabase → Project Settings → API).",
    );
    process.exit(1);
  }
  const host = new URL(url).host;
  if (PROD_HOSTS.includes(host)) {
    console.error(
      `REFUSING: ${host} is your PRODUCTION Supabase host.\n` +
        "Seeding fake users there would corrupt real data and expose users on camera.\n" +
        "Create a separate sandbox project and point .env.seed at it.",
    );
    process.exit(1);
  }

  console.log(`Seeding sandbox → ${host}\n`);
  const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Users (idempotent: reuse if the email already exists). ───────────────────
  const idByEmail = new Map<string, string>();
  for (const p of PLAYERS) {
    const { data, error } = await sb.auth.admin.createUser({
      email: p.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) {
      // Likely already exists — find them by paging the user list.
      const existing = await findUserByEmail(sb, p.email);
      if (!existing) {
        console.error(`  ✗ ${p.email}: ${error?.message ?? "could not create or find"}`);
        continue;
      }
      idByEmail.set(p.email, existing);
    } else {
      idByEmail.set(p.email, data.user.id);
    }
    const id = idByEmail.get(p.email)!;
    // The signup trigger creates the profile row; set a nice display name.
    await sb.from("profiles").upsert({ id, display_name: p.name }, { onConflict: "id" });
  }

  // 2. Brackets (one per player, built from their persona). ──────────────────────
  const bracketByEmail = new Map<string, string>();
  const championByEmail = new Map<string, string>();
  for (const p of PLAYERS) {
    const userId = idByEmail.get(p.email);
    if (!userId) continue;
    const opts = p.nation ? { nation: p.nation } : {};
    const predictions = buildGroupPredictions(p.persona, opts);
    const knockout = buildKnockoutWinners(p.persona, predictions, opts);
    const champ = knockout["104"];
    if (champ) championByEmail.set(p.email, champ);

    // Tiebreaker = total predicted group goals (a plausible per-bracket number).
    const totalGoals = Object.values(predictions).reduce((s, g) => s + (g.home ?? 0) + (g.away ?? 0), 0);

    const { data, error } = await sb
      .from("brackets")
      .insert({
        user_id: userId,
        name: `${p.name.split(" ")[0]}'s Bracket`,
        predictions,
        knockout,
        submitted_at: new Date().toISOString(),
        tiebreaker_total_goals: totalGoals,
        fill_mode: p.persona, // so the owner dashboard shows a real persona spread
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error(`  ✗ bracket for ${p.email}: ${error?.message}`);
      continue;
    }
    bracketByEmail.set(p.email, data.id);
    const champName = champ ? TEAM_BY_CODE.get(champ)?.name ?? champ : "—";
    console.log(`  ✓ ${p.name.padEnd(16)} ${p.persona.padEnd(12)} champion: ${champName}`);
  }

  // 3. Pool + memberships (owned by the first player). ───────────────────────────
  const ownerEmail = PLAYERS[0].email;
  const ownerId = idByEmail.get(ownerEmail)!;
  const code = newInviteCode();
  const { data: pool, error: poolErr } = await sb
    .from("pools")
    .insert({ name: POOL_NAME, owner_id: ownerId, invite_code: code })
    .select("id, invite_code")
    .single();
  if (poolErr || !pool) {
    console.error(`Pool creation failed: ${poolErr?.message}`);
    process.exit(1);
  }
  const memberRows = PLAYERS.filter((p) => idByEmail.has(p.email)).map((p) => ({
    pool_id: pool.id,
    user_id: idByEmail.get(p.email)!,
    bracket_id: bracketByEmail.get(p.email) ?? null,
  }));
  const { error: memErr } = await sb.from("pool_members").upsert(memberRows, { onConflict: "pool_id,user_id" });
  if (memErr) console.error(`  ✗ memberships: ${memErr.message}`);

  // 4. Optional futures picks so the 🎯 leaderboard isn't empty. ──────────────────
  if (process.env.SEED_PICKS === "1") {
    for (const p of PLAYERS) {
      const userId = idByEmail.get(p.email);
      const champ = championByEmail.get(p.email);
      if (!userId || !champ) continue;
      const prob = 18 + Math.floor(Math.random() * 22); // 18–40% implied
      await sb.from("prediction_picks").upsert(
        {
          user_id: userId,
          market_key: "winner",
          outcome_ticker: `DEMO-WINNER-${champ}`,
          outcome_label: TEAM_BY_CODE.get(champ)?.name ?? champ,
          prob_at_pick: prob,
          points: pointsFor(prob),
        },
        { onConflict: "user_id,market_key" },
      );
    }
    console.log("  ✓ seeded one 'winner' futures pick per player");
  }

  console.log(
    `\nDone. Pool "${POOL_NAME}" → invite code ${pool.invite_code}\n` +
      `Log in as yourself on the sandbox, join with that code, and record.\n` +
      `(Any fake user also works: e.g. ${ownerEmail} / ${DEMO_PASSWORD})`,
  );
}

// Page the admin user list to find an existing user by email (createUser dups error).
async function findUserByEmail(sb: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users.length) return null;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// Same friendly alphabet the app uses for invite codes.
function newInviteCode(len = 6): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
