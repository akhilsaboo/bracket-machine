import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AwardPicks,
  BracketKind,
  BracketRecord,
  BracketState,
  KnockoutWinners,
  Predictions,
} from "@/lib/predictions";

export interface BracketRow {
  id: string;
  user_id: string;
  name: string;
  kind: BracketKind | null;
  predictions: Predictions;
  knockout: KnockoutWinners;
  awards: AwardPicks;
  submitted_at: string | null;
  tiebreaker_total_goals: number | null;
  fill_mode: string | null;
}

const SELECT =
  "id, user_id, name, kind, predictions, knockout, awards, submitted_at, tiebreaker_total_goals, fill_mode";

/** Map a Supabase row into a client BracketRecord. */
export function rowToRecord(row: BracketRow): BracketRecord {
  const submitted = !!row.submitted_at;
  const state: BracketState = {
    predictions: (row.predictions as Predictions) ?? {},
    knockout: (row.knockout as KnockoutWinners) ?? {},
    awards: (row.awards as AwardPicks) ?? {},
    // groupSubmitted isn't a column — a submitted bracket implies the group stage was too.
    groupSubmitted: submitted,
    bracketSubmitted: submitted,
    tiebreakerGoals: row.tiebreaker_total_goals,
    fillMode: row.fill_mode ?? null,
  };
  return {
    id: row.id,
    name: row.name || "Bracket 1",
    kind: (row.kind as BracketKind) ?? "normal",
    createdAt: new Date().toISOString(),
    state,
  };
}

/** All of a user's brackets, as client records. */
export async function loadUserBrackets(
  supabase: SupabaseClient,
  userId: string,
): Promise<BracketRecord[]> {
  const { data, error } = await supabase
    .from("brackets")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("brackets load error:", error);
    return [];
  }
  return (data ?? []).map((r) => rowToRecord(r as BracketRow));
}

/** Insert-or-update a bracket by its (client-generated) id. Returns the error
 *  message on failure (null on success) so callers can surface it. */
export async function upsertBracket(
  supabase: SupabaseClient,
  userId: string,
  record: BracketRecord,
): Promise<string | null> {
  const { error } = await supabase.from("brackets").upsert(
    {
      id: record.id,
      user_id: userId,
      name: record.name,
      kind: record.kind,
      predictions: record.state.predictions,
      knockout: record.state.knockout,
      awards: record.state.awards,
      submitted_at: record.state.bracketSubmitted ? new Date().toISOString() : null,
      tiebreaker_total_goals: record.state.tiebreakerGoals,
      fill_mode: record.state.fillMode,
    },
    { onConflict: "id" },
  );
  if (error) console.error("bracket upsert error:", error);
  return error?.message ?? null;
}

/** Remove a bracket row (used when the user deletes a bracket while signed in).
 *  Returns false if the server rejected the delete (e.g. RLS), so the caller can
 *  avoid a local-only delete that would "reappear" on the next sync. */
export async function deleteBracketRow(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await supabase.from("brackets").delete().eq("id", id);
  if (error) console.error("bracket delete error:", error);
  return !error;
}
