import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";

export interface Pool {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
}

export interface PoolMember {
  user_id: string;
  joined_at: string;
  display_name: string | null;
  bracket_id: string | null;
  sc_bracket_id: string | null;
}

export interface MemberBracket {
  id: string;
  user_id: string;
  predictions: Predictions;
  knockout: KnockoutWinners;
  submitted_at: string | null;
  tiebreaker_total_goals: number | null;
  kind?: string; // 'normal' | 'second_chance'
}

// Friendly alphabet (no O/0/I/1/L to avoid invite-code confusion).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newInviteCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export async function createPool(
  sb: SupabaseClient,
  name: string,
  ownerId: string,
  bracketId?: string | null,
): Promise<Pool | null> {
  // Up to 5 retries on the (very rare) unique-collision on invite_code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode();
    const { data, error } = await sb
      .from("pools")
      .insert({ name: name.trim(), owner_id: ownerId, invite_code: code })
      .select()
      .single();
    if (!error && data) {
      // auto-add the creator as a member, attributing their chosen bracket
      await sb
        .from("pool_members")
        .insert({ pool_id: data.id, user_id: ownerId, bracket_id: bracketId ?? null });
      return data as Pool;
    }
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("createPool error:", error);
      return null;
    }
  }
  return null;
}

export async function joinPoolByCode(
  sb: SupabaseClient,
  rawCode: string,
  bracketId?: string | null,
): Promise<{ pool_id: string; name: string } | { error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { error: "Enter an invite code." };
  const { data, error } = await sb.rpc("join_pool_by_invite", { code, bid: bracketId ?? null });
  if (error) return { error: error.message || "Could not join pool." };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "Invite code not found." };
  return row as { pool_id: string; name: string };
}

export async function listMyPools(sb: SupabaseClient): Promise<Pool[]> {
  // Each Pool with the count of members.
  const { data, error } = await sb
    .from("pools")
    .select("*, pool_members(count)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listMyPools error:", error);
    return [];
  }
  return (data ?? []).map((p) => ({
    ...(p as Pool),
    member_count: ((p as unknown as { pool_members: { count: number }[] }).pool_members?.[0]?.count) ?? 0,
  }));
}

export async function getPoolMembers(
  sb: SupabaseClient,
  poolId: string,
): Promise<PoolMember[]> {
  // Fetch members WITHOUT an embedded profiles join — pool_members and profiles
  // have no direct FK (both only reference auth.users), so PostgREST can't embed
  // them and the whole query would error → empty list. Fetch names separately.
  const { data, error } = await sb
    .from("pool_members")
    .select("user_id, joined_at, bracket_id, sc_bracket_id")
    .eq("pool_id", poolId)
    .order("joined_at", { ascending: true });
  if (error) {
    console.error("getPoolMembers error:", error);
    return [];
  }
  const rows = (data ?? []) as {
    user_id: string;
    joined_at: string;
    bracket_id: string | null;
    sc_bracket_id: string | null;
  }[];

  const ids = rows.map((r) => r.user_id);
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profs, error: profErr } = await sb
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    if (profErr) console.error("getPoolMembers profiles error:", profErr);
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name);
    }
  }

  return rows.map((r) => ({
    user_id: r.user_id,
    joined_at: r.joined_at,
    bracket_id: r.bracket_id ?? null,
    sc_bracket_id: r.sc_bracket_id ?? null,
    display_name: names.get(r.user_id) ?? null,
  }));
}

/** Attribute one of my brackets to a pool's main or second-chance slot (or clear
 *  it with null). Returns false if the update errored OR matched no row. */
export async function setPoolBracket(
  sb: SupabaseClient,
  poolId: string,
  userId: string,
  bracketId: string | null,
  slot: "main" | "second_chance" = "main",
): Promise<{ ok: boolean; error: string | null }> {
  const col = slot === "second_chance" ? "sc_bracket_id" : "bracket_id";
  // Upsert (not just update) so it works whether or not the membership row is
  // already present/visible — (pool_id, user_id) is the primary key. Only the
  // chosen slot column is written, leaving the other slot untouched.
  const { data, error } = await sb
    .from("pool_members")
    .upsert({ pool_id: poolId, user_id: userId, [col]: bracketId }, { onConflict: "pool_id,user_id" })
    .select("user_id");
  if (error) {
    console.error("setPoolBracket error:", error);
    return { ok: false, error: error.message };
  }
  if ((data?.length ?? 0) === 0) return { ok: false, error: "update affected 0 rows (membership row not visible?)" };
  return { ok: true, error: null };
}

/** Transfer pool ownership to another member (owner-only; validated server-side). */
export async function transferPoolOwnership(
  sb: SupabaseClient,
  poolId: string,
  newOwnerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.rpc("transfer_pool_ownership", { pid: poolId, new_owner: newOwnerId });
  if (error) {
    console.error("transferPoolOwnership error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Fetch specific brackets by id (the ones attributed to a pool). */
export async function getBracketsByIds(
  sb: SupabaseClient,
  ids: string[],
): Promise<MemberBracket[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb
    .from("brackets")
    .select("id, user_id, predictions, knockout, submitted_at, tiebreaker_total_goals, kind")
    .in("id", ids);
  if (error) {
    console.error("getBracketsByIds error:", error);
    return [];
  }
  return (data ?? []) as MemberBracket[];
}

export async function getMemberBrackets(
  sb: SupabaseClient,
  userIds: string[],
): Promise<MemberBracket[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await sb
    .from("brackets")
    .select("id, user_id, predictions, knockout, submitted_at, tiebreaker_total_goals, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getMemberBrackets error:", error);
    return [];
  }
  // A user can now own multiple brackets; until pool attribution lands (Phase 2),
  // use each member's earliest bracket so leaderboards stay deterministic.
  const seen = new Set<string>();
  const first: MemberBracket[] = [];
  for (const row of (data ?? []) as MemberBracket[]) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    first.push(row);
  }
  return first;
}

export async function leavePool(
  sb: SupabaseClient,
  poolId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await sb.from("pool_members").delete().eq("pool_id", poolId).eq("user_id", userId);
  if (error) console.error("leavePool error:", error);
  return !error;
}

/** Owner-only — cascades and removes pool + memberships. */
export async function deletePool(
  sb: SupabaseClient,
  poolId: string,
): Promise<boolean> {
  const { error } = await sb.from("pools").delete().eq("id", poolId);
  if (error) console.error("deletePool error:", error);
  return !error;
}
