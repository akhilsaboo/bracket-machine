import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SECONDCHANCE_KEY,
  SECONDCHANCE_SEND_AT_ISO,
  secondChanceHtml,
  secondChanceSubject,
  sendBatch,
  sendEmail,
} from "@/lib/email";

// Second-chance promo to EVERY signed-up email (minus opt-outs). Uniform copy with
// a first-name greeting — no standings, so it doesn't need the leaderboard snapshot
// and can send the moment the group stage settles. Same safety model as /api/recap:
// admin/cron-gated, ?dry=1 previews, refuses to send before SECONDCHANCE_SEND_AT_ISO,
// idempotent via email_reminders_log (secondchance-v1), ?force=1 overrides,
// ?to=<email> sends one test copy. Cron-fired the evening the group stage ends.

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

async function readNames(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await sb.from("profiles").select("id, display_name").in("id", ids.slice(i, i + 1000));
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) names.set(p.id, p.display_name);
    }
  }
  return names;
}

function firstName(name: string | undefined, email: string): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const local = email.split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
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
  const due = force || Date.now() >= Date.parse(SECONDCHANCE_SEND_AT_ISO);

  const { data: log } = await sb
    .from("email_reminders_log")
    .select("milestone_key")
    .eq("milestone_key", SECONDCHANCE_KEY)
    .maybeSingle();
  const alreadySent = !!log;

  const people = await recipients(sb);
  const names = await readNames(sb, people.map((p) => p.id));

  // Test copy.
  if (to) {
    if (!process.env.RESEND_API_KEY) return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
    const known = people.find((p) => p.email.toLowerCase() === to.toLowerCase());
    const fn = firstName(known ? names.get(known.id) : undefined, to);
    const ok = await sendEmail(to, secondChanceSubject(), secondChanceHtml(fn, known?.id ?? to));
    return Response.json({ test: true, to, sent: ok, firstName: fn });
  }

  if (dry) {
    return Response.json({
      dryRun: true,
      scheduledFor: SECONDCHANCE_SEND_AT_ISO,
      due,
      recipients: people.length,
      sample: people.slice(0, 6).map((p) => ({ email: p.email, firstName: firstName(names.get(p.id), p.email) })),
      alreadySent,
      emailConfigured: !!process.env.RESEND_API_KEY,
    });
  }
  if (!due) return Response.json({ scheduled: SECONDCHANCE_SEND_AT_ISO, note: "not due yet", recipients: people.length });
  if (alreadySent && !force) return Response.json({ skipped: true, reason: "already sent — ?force=1 to resend", recipients: people.length });
  if (!process.env.RESEND_API_KEY) return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

  const { sent, failed } = await sendBatch(
    people.map((p) => ({
      to: p.email,
      subject: secondChanceSubject(),
      html: secondChanceHtml(firstName(names.get(p.id), p.email), p.id),
    })),
  );
  await sb.from("email_reminders_log").upsert({ milestone_key: SECONDCHANCE_KEY }, { onConflict: "milestone_key", ignoreDuplicates: true });
  return Response.json({ sent, failed, recipients: people.length });
}
