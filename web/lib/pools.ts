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
}

export interface MemberBracket {
  id: string;
  user_id: string;
  predictions: Predictions;
  knockout: KnockoutWinners;
  submitted_at: string | null;
  tiebreaker_total_goals: number | null;
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
      // auto-add the creator as a member
      await sb.from("pool_members").insert({ pool_id: data.id, user_id: ownerId });
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
): Promise<{ pool_id: string; name: string } | { error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { error: "Enter an invite code." };
  const { data, error } = await sb.rpc("join_pool_by_invite", { code });
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
  const { data, error } = await sb
    .from("pool_members")
    .select("user_id, joined_at, profiles(display_name)")
    .eq("pool_id", poolId)
    .order("joined_at", { ascending: true });
  if (error) {
    console.error("getPoolMembers error:", error);
    return [];
  }
  return (data ?? []).map((m) => {
    const row = m as unknown as {
      user_id: string;
      joined_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      user_id: row.user_id,
      joined_at: row.joined_at,
      display_name: profile?.display_name ?? null,
    };
  });
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
