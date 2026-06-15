import { createClient } from "@supabase/supabase-js";
import { SCHEDULE } from "@/lib/data";
import { isLocked } from "@/lib/schedule";
import { isKnockoutStarted } from "@/lib/results";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";

// Read-only "view someone else's bracket" data source. The cardinal rule of pick
// visibility is enforced HERE, server-side: a pick is only ever returned once it's
// LOCKED, so an unlocked pick can never reach another user's browser to be copied.
//   • group picks  → revealed per-match, the moment that match kicks off
//   • knockout     → revealed once the knockout bracket locks (stage start)
//   • tiebreaker   → revealed once the tournament has started (locks at first KO)
// Everything still-editable is stripped before the response leaves the server.

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export async function GET(req: Request) {
  const sb = admin();
  if (!sb) return Response.json({ error: "server not configured" }, { status: 500 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const { data, error } = await sb
    .from("brackets")
    .select("id, user_id, name, predictions, knockout, tiebreaker_total_goals")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  const { data: prof } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", data.user_id)
    .maybeSingle();

  const now = new Date();
  const koStarted = isKnockoutStarted(now);
  const tournamentStarted = SCHEDULE.some((f) => isLocked(f, now));

  // Keep ONLY locked matches' picks.
  const allPredictions = (data.predictions ?? {}) as Predictions;
  const predictions: Predictions = {};
  for (const f of SCHEDULE) {
    if (isLocked(f, now) && allPredictions[f.id]) predictions[f.id] = allPredictions[f.id];
  }

  return Response.json(
    {
      name: prof?.display_name ?? "Anonymous",
      bracketName: data.name || "Bracket",
      predictions,
      knockout: koStarted ? ((data.knockout ?? {}) as KnockoutWinners) : {},
      tiebreakerGoals: tournamentStarted ? (data.tiebreaker_total_goals ?? null) : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
