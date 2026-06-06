import { createHmac } from "crypto";

// ── Email reminders (ESPN-style): nudge signed-up users who haven't submitted a
// bracket, as the tournament nears. Sends via Resend (https://resend.com); inert
// until RESEND_API_KEY is set. Every email carries a one-click unsubscribe link.

const RESEND_URL = "https://api.resend.com/emails";
const APP_URL = "https://bracketmachine.app";

/** A reminder, fired at an exact UTC instant (not a calendar date). */
export interface Milestone {
  key: string;
  sendAtISO: string;
  subject: string;
  headline: string;
  body: string;
}
// Deliberately ONE pre-tournament reminder: a single high-intent "last day"
// nudge the day before kickoff. A young sending domain can't afford to blast
// non-engaged users — it burns deliverability for the emails we actually want
// to land later (knockout-stage prompts). Re-engagement after the group stage
// is handled separately (the second-chance bracket), not here.
export const MILESTONES: Milestone[] = [
  {
    key: "d1",
    // Exactly 24h before Match 1 (MEX–RSA, Estadio Azteca, Mexico City; kickoff
    // 2026-06-11T19:00Z). The route gates on this instant, so it never fires early.
    sendAtISO: "2026-06-10T19:00:00Z",
    subject: "⚽ Call every game while it's all still open",
    headline: "The World Cup kicks off tomorrow",
    body: "Make your picks before the action begins. Once the games start, they lock one at a time as each kicks off — so today's the day to get your bracket in.",
  },
];

// ── Unsubscribe tokens (HMAC of the user id, so links can't be forged) ──
function tokenSecret(): string {
  return process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-secret";
}
export function unsubToken(userId: string): string {
  return createHmac("sha256", tokenSecret()).update(userId).digest("hex").slice(0, 24);
}
export function verifyUnsub(userId: string, token: string): boolean {
  return !!userId && !!token && unsubToken(userId) === token;
}
export function unsubUrl(userId: string): string {
  return `${APP_URL}/api/reminders/unsubscribe?u=${userId}&t=${unsubToken(userId)}`;
}

export function reminderHtml(m: Milestone, userId: string): string {
  const unsub = unsubUrl(userId);
  return `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px;padding:28px 24px;text-align:center;color:#fff">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.9;font-weight:bold">Bracket Machine</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">${m.headline}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;color:#0f172a">
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${m.body}</p>
      <a href="${APP_URL}" style="display:block;background:#db2777;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px;border-radius:10px;font-size:15px">Build your bracket →</a>
    </div>
    <p style="text-align:center;color:#64748b;font-size:11px;line-height:1.6;margin-top:18px">
      You're getting this because you signed up at bracketmachine.app.<br/>
      <a href="${unsub}" style="color:#94a3b8">Unsubscribe from reminders</a>
    </p>
  </div></body></html>`;
}

/** Send one email via Resend. Returns true on success; false if not configured. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.REMINDER_FROM ?? "Bracket Machine <onboarding@resend.dev>";
  try {
    const r = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
