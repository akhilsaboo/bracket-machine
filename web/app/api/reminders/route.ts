import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TOURNAMENT_START_ISO } from "@/lib/results";
import { MILESTONES, milestoneDate, reminderHtml, sendEmail, type Milestone } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reminder cron: pick the milestone that's now due (and not yet sent), email
// every signed-up user who hasn't submitted a bracket and hasn't opted out.
// Safe by default: ?dry=1 reports without sending; nothing sends without
// RESEND_API_KEY. Cron-gated; ?key=d1 forces the milestone.

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

async function recipients(sb: SupabaseClient): Promise<{ id: string; email: string }[]> {
  // Submitters (any bracket with a submitted_at) — they don't need a nudge.
  const { data: subs } = await sb.from("brackets").select("user_id").not("submitted_at", "is", null);
  const submitted = new Set((subs ?? []).map((r) => (r as { user_id: string }).user_id));
  // Opted out.
  const { data: outs } = await sb.from("profiles").select("id").eq("email_opt_out", true);
  const optedOut = new Set((outs ?? []).map((r) => (r as { id: string }).id));
  // All auth users (one page of up to 1000 — fine for our scale).
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const out: { id: string; email: string }[] = [];
  for (const u of list?.users ?? []) {
    if (u.email && !submitted.has(u.id) && !optedOut.has(u.id)) out.push({ id: u.id, email: u.email });
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const forced = url.searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (!dry && secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = admin();
  if (!sb) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" });

  const today = new Date().toISOString().slice(0, 10);
  const startDate = TOURNAMENT_START_ISO.slice(0, 10);

  // Which milestones have already been sent?
  const { data: log } = await sb.from("email_reminders_log").select("milestone_key");
  const sentKeys = new Set((log ?? []).map((r) => (r as { milestone_key: string }).milestone_key));

  // Choose the milestone to send.
  let chosen: Milestone | undefined;
  let skipped: Milestone[] = [];
  if (forced) {
    chosen = MILESTONES.find((m) => m.key === forced);
  } else if (today <= startDate) {
    // Due (date passed) and not yet sent; send the most recent, skip older ones.
    const due = MILESTONES.filter((m) => milestoneDate(m) <= today && !sentKeys.has(m.key)).sort(
      (a, b) => a.daysBefore - b.daysBefore,
    );
    chosen = due[0];
    skipped = due.slice(1);
  }

  if (!chosen) {
    return Response.json({ today, startDate, chosen: null, note: "no milestone due", dry });
  }

  // Hard safety gate: actually send only when explicitly enabled AND a provider
  // key is set AND not a dry run. Otherwise this just previews (no send, no log),
  // so the daily cron can't email anyone until you flip REMINDERS_LIVE=1.
  const canSend = !dry && process.env.REMINDERS_LIVE === "1" && !!process.env.RESEND_API_KEY;
  const people = await recipients(sb);
  let sent = 0;
  if (canSend) {
    for (const p of people) {
      const ok = await sendEmail(p.email, chosen.subject, reminderHtml(chosen, p.id));
      if (ok) sent++;
    }
    // Log the chosen + any skipped milestones so they never re-fire.
    const rows = [chosen, ...skipped].map((m) => ({ milestone_key: m.key, sent_at: new Date().toISOString() }));
    await sb.from("email_reminders_log").upsert(rows, { onConflict: "milestone_key", ignoreDuplicates: true });
  }

  return Response.json({
    dry,
    live: process.env.REMINDERS_LIVE === "1",
    emailConfigured: !!process.env.RESEND_API_KEY,
    canSend,
    milestone: chosen.key,
    subject: chosen.subject,
    recipients: people.length,
    sent,
    skippedMilestones: skipped.map((m) => m.key),
  });
}
