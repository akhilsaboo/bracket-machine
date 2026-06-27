import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { percentileOf } from "@/lib/leaderboard";
import {
  GROUPFINAL_KEY,
  GROUPFINAL_SEND_AT_ISO,
  groupFinalHtml,
  groupFinalSubject,
  sendBatch,
  sendEmail,
  type RecapData,
  type RecapTier,
} from "@/lib/email";

// "Last day of the group stage" broadcast to EVERY signed-up email (minus opt-outs).
// Same safety model as /api/recap: admin/cron-gated, ?dry=1 previews, refuses to
// send before GROUPFINAL_SEND_AT_ISO, idempotent via email_reminders_log
// (groupfinal-v1), ?force=1 overrides, ?to=<email> sends one test copy. Carries
// personalized standings + the knockout-bracket lock time. All per-user numbers
// come from the global leaderboard snapshot — no re-scoring.

interface LbRow {
  rank: number;
  user_id: string;
  bracket_id: string;
  bracket_name: string;
  points: number;
  exact: number;
}
interface Snapshot {
  rows: LbRow[];
  scores: number[];
  totalEntries: number;
  hasResults: boolean;
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

async function recipients(sb: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const { data: outs } = await sb.from("profiles").select("id").eq("email_opt_out", true);
  const optedOut = new Set((outs ?? []).map((o) => (o as { id: string }).id));
  const out: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const u of users) if (u.email && !optedOut.has(u.id)) out.push({ id: u.id, email: u.email });
    if (users.length < 1000) break;
  }
  return out;
}

interface Ctx {
  userBest: Map<string, LbRow>;
  scores: number[];
  total: number;
  names: Map<string, string>;
  userPools: Map<string, { name: string; rank: number; members: number }[]>;
}

function firstName(name: string | undefined, email: string): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const local = email.split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

function buildData(uid: string, email: string, ctx: Ctx): RecapData {
  const best = ctx.userBest.get(uid);
  const pools = ctx.userPools.get(uid) ?? [];
  const fn = firstName(ctx.names.get(uid), email);
  if (!best || best.points === 0) {
    return { userId: uid, firstName: fn, tier: "empty", bracketName: "", points: 0, rank: 0, total: ctx.total, exact: 0, percentile: 0, pools };
  }
  const percentile = percentileOf(ctx.scores, best.points);
  const tier: RecapTier = percentile >= 80 ? "top" : percentile >= 40 ? "mid" : "low";
  return {
    userId: uid,
    firstName: fn,
    tier,
    bracketName: best.bracket_name,
    points: best.points,
    rank: best.rank,
    total: ctx.total,
    exact: best.exact,
    percentile,
    pools,
  };
}

export async function GET(req: Request) {
  const sb = admin();
  if (!sb) return Response.json({ error: "server not configured" }, { status: 500 });

  const provided = req.headers.get("authorization");
  const authed =
    (!!process.env.CRON_SECRET && provided === `Bearer ${process.env.CRON_SECRET}`) ||
    (!!process.env.ADMIN_SECRET && provided === `Bearer ${process.env.ADMIN_SECRET}`);
  if (!authed) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const dry = params.get("dry") === "1";
  const force = params.get("force") === "1";
  const to = params.get("to");
  const due = force || Date.now() >= Date.parse(GROUPFINAL_SEND_AT_ISO);

  const { data: log } = await sb
    .from("email_reminders_log")
    .select("milestone_key")
    .eq("milestone_key", GROUPFINAL_KEY)
    .maybeSingle();
  const alreadySent = !!log;

  // Fresh global snapshot (recomputes if stale) — source of every per-user number.
  const origin = new URL(req.url).origin;
  let snap: Snapshot;
  try {
    snap = (await (await fetch(`${origin}/api/leaderboard`, { cache: "no-store" })).json()) as Snapshot;
  } catch {
    return Response.json({ error: "could not load leaderboard snapshot" }, { status: 502 });
  }
  if (!snap.hasResults || !snap.rows?.length) {
    return Response.json({ error: "no results yet — nothing to send" }, { status: 409 });
  }

  // Maps from the snapshot.
  const bracketPoints = new Map<string, number>();
  const userBest = new Map<string, LbRow>();
  for (const r of snap.rows) {
    bracketPoints.set(r.bracket_id, r.points);
    const cur = userBest.get(r.user_id);
    if (!cur || r.rank < cur.rank) userBest.set(r.user_id, r);
  }

  // Pool standings — rank each pool's members by their attributed bracket's points
  // (fallback to the member's best bracket), straight from the snapshot map.
  const userPools = new Map<string, { name: string; rank: number; members: number }[]>();
  const { data: pools } = await sb.from("pools").select("id, name");
  const { data: pms } = await sb.from("pool_members").select("pool_id, user_id, bracket_id");
  const membersByPool = new Map<string, { user_id: string; bracket_id: string | null }[]>();
  for (const m of (pms ?? []) as { pool_id: string; user_id: string; bracket_id: string | null }[]) {
    const arr = membersByPool.get(m.pool_id) ?? [];
    arr.push({ user_id: m.user_id, bracket_id: m.bracket_id });
    membersByPool.set(m.pool_id, arr);
  }
  for (const p of (pools ?? []) as { id: string; name: string }[]) {
    const members = membersByPool.get(p.id) ?? [];
    const scored = members.map((m) => ({
      user_id: m.user_id,
      pts: (m.bracket_id ? bracketPoints.get(m.bracket_id) : undefined) ?? userBest.get(m.user_id)?.points ?? 0,
    }));
    scored.sort((a, b) => b.pts - a.pts);
    scored.forEach((s, i) => {
      const list = userPools.get(s.user_id) ?? [];
      list.push({ name: p.name, rank: i + 1, members: scored.length });
      userPools.set(s.user_id, list);
    });
  }

  // Display names.
  const names = new Map<string, string>();
  const uids = [...new Set(snap.rows.map((r) => r.user_id))];
  for (let i = 0; i < uids.length; i += 1000) {
    const { data } = await sb.from("profiles").select("id, display_name").in("id", uids.slice(i, i + 1000));
    for (const pr of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (pr.display_name) names.set(pr.id, pr.display_name);
    }
  }

  const ctx: Ctx = { userBest, scores: snap.scores ?? [], total: snap.totalEntries, names, userPools };
  const people = await recipients(sb);

  // Test copy.
  if (to) {
    if (!process.env.RESEND_API_KEY) return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
    const known = people.find((p) => p.email.toLowerCase() === to.toLowerCase());
    const data = buildData(known?.id ?? to, to, ctx);
    const ok = await sendEmail(to, groupFinalSubject(data), groupFinalHtml(data));
    return Response.json({ test: true, to, sent: ok, tier: data.tier, rank: data.rank, pools: data.pools });
  }

  if (dry) {
    const sample = people.slice(0, 6).map((p) => {
      const d = buildData(p.id, p.email, ctx);
      return { email: p.email, tier: d.tier, rank: d.rank, points: d.points, pools: d.pools.length };
    });
    const tiers = { top: 0, mid: 0, low: 0, empty: 0 } as Record<RecapTier, number>;
    for (const p of people) tiers[buildData(p.id, p.email, ctx).tier]++;
    return Response.json({
      dryRun: true,
      scheduledFor: GROUPFINAL_SEND_AT_ISO,
      due,
      recipients: people.length,
      total: snap.totalEntries,
      tiers,
      sample,
      alreadySent,
      emailConfigured: !!process.env.RESEND_API_KEY,
    });
  }
  if (!due) return Response.json({ scheduled: GROUPFINAL_SEND_AT_ISO, note: "not due yet", recipients: people.length });
  if (alreadySent && !force) return Response.json({ skipped: true, reason: "already sent — ?force=1 to resend", recipients: people.length });
  if (!process.env.RESEND_API_KEY) return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  const { sent, failed } = await sendBatch(
    people.map((p) => {
      const d = buildData(p.id, p.email, ctx);
      return { to: p.email, subject: groupFinalSubject(d), html: groupFinalHtml(d) };
    }),
  );
  await sb.from("email_reminders_log").upsert({ milestone_key: GROUPFINAL_KEY }, { onConflict: "milestone_key", ignoreDuplicates: true });
  return Response.json({ sent, failed, recipients: people.length });
}
