import type { SupabaseClient } from "@supabase/supabase-js";
import type { AwardPicks, KnockoutWinners, Predictions } from "@/lib/predictions";

export interface BracketRow {
  id: string;
  user_id: string;
  predictions: Predictions;
  knockout: KnockoutWinners;
  awards: AwardPicks;
  submitted_at: string | null;
  tiebreaker_total_goals: number | null;
}

export interface BracketSeed {
  predictions: Predictions;
  knockout: KnockoutWinners;
  awards: AwardPicks;
  submittedAt: string | null;
  tiebreakerGoals: number | null;
}

/** Returns the user's primary bracket; creates one seeded from local state if absent. */
export async function loadOrCreatePrimaryBracket(
  supabase: SupabaseClient,
  userId: string,
  seed: BracketSeed,
): Promise<BracketRow | null> {
  const { data: existing, error: selectErr } = await supabase
    .from("brackets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (selectErr) {
    console.error("brackets select error:", selectErr);
    return null;
  }
  if (existing && existing.length > 0) return existing[0] as BracketRow;

  const { data: created, error: insertErr } = await supabase
    .from("brackets")
    .insert({
      user_id: userId,
      predictions: seed.predictions,
      knockout: seed.knockout,
      awards: seed.awards,
      submitted_at: seed.submittedAt,
      tiebreaker_total_goals: seed.tiebreakerGoals,
    })
    .select("*")
    .single();
  if (insertErr) {
    console.error("brackets insert error:", insertErr);
    return null;
  }
  return created as BracketRow;
}

export async function saveBracket(
  supabase: SupabaseClient,
  id: string,
  patch: BracketSeed,
): Promise<void> {
  const { error } = await supabase
    .from("brackets")
    .update({
      predictions: patch.predictions,
      knockout: patch.knockout,
      awards: patch.awards,
      submitted_at: patch.submittedAt,
      tiebreaker_total_goals: patch.tiebreakerGoals,
    })
    .eq("id", id);
  if (error) console.error("brackets save error:", error);
}
