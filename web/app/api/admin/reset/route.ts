import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click launch reset (service-role, secret-gated, POST only so it can't be
// triggered by a stray GET/crawler).
//   POST /api/admin/reset            → clears derived caches (insights + snapshots)
//   POST /api/admin/reset?data=1     → ALSO wipes all brackets/pools/picks (test
//                                      data). Accounts/profiles are kept.
// Auth: Authorization: Bearer <CRON_SECRET>.
function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

// Delete every row (service role bypasses RLS; "<pk> is not null" matches all).
async function clearAll(sb: SupabaseClient, table: string, notNullCol: string) {
  const { error } = await sb.from(table).delete().not(notNullCol, "is", null);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = admin();
  if (!sb) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { headers: { "cache-control": "no-store" } });
  }

  const wipeData = new URL(req.url).searchParams.get("data") === "1";
  const cleared: string[] = [];
  try {
    // Caches (always) — safe, they regenerate.
    await clearAll(sb, "match_insights", "key");
    cleared.push("match_insights");
    await clearAll(sb, "market_snapshots", "key");
    cleared.push("market_snapshots");

    if (wipeData) {
      // Order respects FKs: members reference pools+brackets.
      await clearAll(sb, "pool_members", "user_id");
      cleared.push("pool_members");
      await clearAll(sb, "prediction_picks", "user_id");
      cleared.push("prediction_picks");
      await clearAll(sb, "pools", "id");
      cleared.push("pools");
      await clearAll(sb, "brackets", "id");
      cleared.push("brackets");
    }
  } catch (e) {
    return Response.json(
      { ok: false, cleared, error: e instanceof Error ? e.message : String(e) },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json({ ok: true, wipeData, cleared }, { headers: { "cache-control": "no-store" } });
}
