import type { SupabaseClient } from "@supabase/supabase-js";

// A single futures pick, mirrored between localStorage (guests) and the
// prediction_picks table (signed-in, cross-device + pool leaderboards).
export interface StoredPick {
  ticker: string; // outcome market ticker (or "<series>-NO" for a binary No)
  label: string;
  prob: number | null; // implied % frozen at pick time
  flagIso2?: string;
  points?: number | null; // potential points (round(10/(p/100)) cap 100)
}
export type PicksByMarket = Record<string, StoredPick>; // keyed by FUTURES key

/** Potential points for a pick at probability p (0..100). null when no odds. */
export function pointsFor(prob: number | null | undefined): number | null {
  if (prob == null || prob <= 0) return null;
  return Math.min(100, Math.round(10 / (prob / 100)));
}

interface Row {
  market_key: string;
  outcome_ticker: string;
  outcome_label: string;
  flag_iso2: string | null;
  prob_at_pick: number | null;
  points: number | null;
  correct: boolean | null;
}

const rowToPick = (r: Row): StoredPick => ({
  ticker: r.outcome_ticker,
  label: r.outcome_label,
  prob: r.prob_at_pick,
  flagIso2: r.flag_iso2 ?? "",
  points: r.points,
});

/** Load the current user's picks from Supabase, keyed by market. */
export async function loadMyPicks(sb: SupabaseClient, userId: string): Promise<PicksByMarket> {
  const { data, error } = await sb
    .from("prediction_picks")
    .select("market_key, outcome_ticker, outcome_label, flag_iso2, prob_at_pick, points, correct")
    .eq("user_id", userId);
  if (error) {
    console.error("loadMyPicks error:", error);
    return {};
  }
  const out: PicksByMarket = {};
  for (const r of (data ?? []) as Row[]) out[r.market_key] = rowToPick(r);
  return out;
}

/** Upsert one pick (keyed by user + market). */
export async function saveMyPick(
  sb: SupabaseClient,
  userId: string,
  marketKey: string,
  pick: StoredPick,
): Promise<string | null> {
  const { error } = await sb.from("prediction_picks").upsert(
    {
      user_id: userId,
      market_key: marketKey,
      outcome_ticker: pick.ticker,
      outcome_label: pick.label,
      flag_iso2: pick.flagIso2 ?? "",
      prob_at_pick: pick.prob,
      points: pick.points ?? pointsFor(pick.prob),
    },
    { onConflict: "user_id,market_key" },
  );
  if (error) console.error("saveMyPick error:", error);
  return error?.message ?? null;
}

/** Remove a pick (user cleared their selection for a market). */
export async function deleteMyPick(
  sb: SupabaseClient,
  userId: string,
  marketKey: string,
): Promise<void> {
  const { error } = await sb
    .from("prediction_picks")
    .delete()
    .eq("user_id", userId)
    .eq("market_key", marketKey);
  if (error) console.error("deleteMyPick error:", error);
}

export interface UserPicksSummary {
  user_id: string;
  count: number; // number of markets picked
  potential: number; // sum of potential points
  earned: number; // sum of points on resolved-correct picks
  resolved: boolean; // any markets resolved yet?
}

/** Per-user pick summaries for a set of users (pool leaderboard). */
export async function getPicksSummary(
  sb: SupabaseClient,
  userIds: string[],
): Promise<Map<string, UserPicksSummary>> {
  const map = new Map<string, UserPicksSummary>();
  if (userIds.length === 0) return map;
  const { data, error } = await sb
    .from("prediction_picks")
    .select("user_id, points, correct")
    .in("user_id", userIds);
  if (error) {
    console.error("getPicksSummary error:", error);
    return map;
  }
  for (const r of (data ?? []) as { user_id: string; points: number | null; correct: boolean | null }[]) {
    const s = map.get(r.user_id) ?? { user_id: r.user_id, count: 0, potential: 0, earned: 0, resolved: false };
    s.count += 1;
    s.potential += r.points ?? 0;
    if (r.correct !== null) s.resolved = true;
    if (r.correct === true) s.earned += r.points ?? 0;
    map.set(r.user_id, s);
  }
  return map;
}
