import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PSA_KEY, PSA_SUBJECT, psaHtml, sendBatch } from "@/lib/email";

// One-off PSA broadcast to EVERY signed-up email (minus opt-outs). Manual + admin-
// gated + safe-by-default: a plain call is a DRY RUN (returns the recipient count,
// sends nothing). Add ?send=1 to actually send; it's logged in email_reminders_log
// so it can't double-send (override with ?force=1). Honors the same unsubscribe /
// email_opt_out plumbing as the reminder cron.

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
    for (const u of users) {
      if (u.email && !optedOut.has(u.id)) out.push({ id: u.id, email: u.email });
    }
    if (users.length < 1000) break;
  }
  return out;
}

export async function GET(req: Request) {
  const sb = admin();
  if (!sb) return Response.json({ error: "server not configured" }, { status: 500 });

  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const send = params.get("send") === "1";
  const force = params.get("force") === "1";

  const { data: log } = await sb
    .from("email_reminders_log")
    .select("milestone_key")
    .eq("milestone_key", PSA_KEY)
    .maybeSingle();
  const alreadySent = !!log;

  const people = await recipients(sb);

  if (!send) {
    return Response.json({
      dryRun: true,
      subject: PSA_SUBJECT,
      recipients: people.length,
      sample: people.slice(0, 5).map((p) => p.email),
      alreadySent,
      emailConfigured: !!process.env.RESEND_API_KEY,
    });
  }
  if (alreadySent && !force) {
    return Response.json({ skipped: true, reason: "already sent — add ?force=1 to resend", recipients: people.length });
  }
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const { sent: ok, failed } = await sendBatch(
    people.map((p) => ({ to: p.email, subject: PSA_SUBJECT, html: psaHtml(p.id) })),
  );
  await sb
    .from("email_reminders_log")
    .upsert({ milestone_key: PSA_KEY }, { onConflict: "milestone_key", ignoreDuplicates: true });

  return Response.json({ sent: ok, failed, recipients: people.length });
}
