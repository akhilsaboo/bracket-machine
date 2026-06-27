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

// ── One-off broadcast PSA — "your picks aren't locked". Fired by a single-date
// Vercel cron at this exact instant (8am Pacific / PDT = 15:00 UTC, Jun 15) and
// gated on it server-side so it can't go early; idempotent so it can't double-send.
export const PSA_KEY = "psa-picks-v1";
export const PSA_SUBJECT = "Psst — your picks aren’t locked in yet";
export const PSA_SEND_AT_ISO = "2026-06-15T15:00:00Z";

export function psaHtml(userId: string): string {
  const unsub = unsubUrl(userId);
  return `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px;padding:28px 24px;text-align:center;color:#fff">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.9;font-weight:bold">Bracket Machine</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">Your picks aren’t locked in yet</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;color:#0f172a">
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">Hey — quick note from the person who built Bracket Machine. Now that the group stage is rolling, two things worth knowing:</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px"><strong>1. You can change any pick right up until that match kicks off.</strong> Nothing locks early — keep tweaking your scores all the way until the knockout round begins.</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px"><strong>2. Not loving how your bracket’s going? Start a brand-new one anytime.</strong> You’ll only miss the games already played — you’re right back in it for everything still to come. (Up to 25 brackets per account, and they all rank on the leaderboard.)</p>
      <a href="${APP_URL}" style="display:block;background:#db2777;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px;border-radius:10px;font-size:15px">Open Bracket Machine →</a>
      <p style="font-size:14px;line-height:1.5;margin:20px 0 0;color:#475569">See you on the leaderboard ⚽<br/>— Akhil, Bracket Machine</p>
    </div>
    <p style="text-align:center;color:#64748b;font-size:11px;line-height:1.6;margin-top:18px">
      You’re getting this because you signed up at bracketmachine.app.<br/>
      <a href="${unsub}" style="color:#94a3b8">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

// ── Personalized Matchday-1 recap broadcast ────────────────────────────────
export const RECAP_KEY = "recap-md1-v1";
export const RECAP_SEND_AT_ISO = "2026-06-18T15:00:00Z"; // 8am PDT, Jun 18

export type RecapTier = "top" | "mid" | "low" | "empty";
export interface RecapData {
  userId: string;
  firstName: string;
  tier: RecapTier;
  bracketName: string;
  points: number;
  rank: number;
  total: number;
  exact: number;
  percentile: number;
  pools: { name: string; rank: number; members: number }[];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function ordinal(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${s}`;
}

export function recapSubject(d: RecapData): string {
  return d.tier === "empty"
    ? "Matchday 1’s done — your bracket’s still empty"
    : `You’re #${d.rank} of ${d.total} — Matchday 1 recap`;
}

export function recapHtml(d: RecapData): string {
  const unsub = unsubUrl(d.userId);
  const P = (html: string, extra = "") =>
    `<p style="font-size:15px;line-height:1.55;margin:0 0 16px;${extra}">${html}</p>`;

  const headline =
    d.tier === "empty"
      ? "⚽ Your Matchday 1 recap"
      : `${d.tier === "top" ? "🔥" : d.tier === "mid" ? "👀" : "💪"} You’re #${d.rank} of ${d.total}`;

  const intro =
    d.tier === "empty"
      ? "Every team has played one group game, with two more to go before the knockouts. Looks like you haven’t gotten in the game yet, though."
      : "Every team has played one group game, with two more to go before the knockouts. Here’s where you sit.";

  const name = esc(d.bracketName) || "your bracket";
  let standing: string;
  if (d.tier === "top")
    standing = `<strong>🔥 You’re crushing it.</strong> Your best bracket, <strong>${name}</strong>, is <strong>#${d.rank} of ${d.total}</strong> — the top <strong>${Math.max(1, 100 - d.percentile)}%</strong> of everyone playing. Whatever you’re doing, keep doing it.`;
  else if (d.tier === "mid")
    standing = `<strong>👀 Solid start.</strong> <strong>${name}</strong> sits <strong>#${d.rank} of ${d.total}</strong> — right in the hunt. A strong Matchday 2 and you’re knocking on the leaders’ door.`;
  else if (d.tier === "low")
    standing = `<strong>💪 Some ground to make up.</strong> <strong>${name}</strong> is <strong>#${d.rank} of ${d.total}</strong> — but Matchday 1 is just 1 of 7 rounds. There’s a whole tournament left to climb.`;
  else
    standing = `<strong>🫥 Your bracket’s sitting at 0 points</strong> with no picks locked in. Good news: the bulk of the tournament, and the points, is still ahead of you.`;

  const stats =
    d.tier === "empty"
      ? ""
      : P(
          `📊 <strong>${d.points} pts</strong> · <strong>${d.exact}</strong> exact scoreline${d.exact === 1 ? "" : "s"} nailed · ${ordinal(d.percentile)} percentile.`,
          "background:#f1f5f9;border-radius:10px;padding:10px 14px;font-size:14px",
        );

  const poolsBlock = d.pools.length
    ? P(`<strong>🏆 Your pools</strong>`, "margin-bottom:6px") +
      `<div style="font-size:15px;line-height:1.7;margin:0 0 16px">${d.pools
        .map((p) => `• ${esc(p.name)} — <strong>#${p.rank} of ${p.members}</strong>${p.rank === 1 ? " 🥇" : ""}`)
        .join("<br/>")}</div>`
    : "";

  const editable = "Every pick stays editable right up until that match kicks off.";
  let advice: string;
  if (d.tier === "top")
    advice = "You’re flying near the top, so <strong>don’t change a thing</strong> — no need to restart what’s working. Just keep calling them.";
  else if (d.tier === "mid")
    advice = "You’ve got a good thing going, so keep building on it. (A fresh bracket’s always an option, but you’re well-positioned where you are.)";
  else if (d.tier === "low")
    advice = "<strong>Not happy with your bracket? A restart doesn’t put you back at square one — it drops you into the <em>now</em>.</strong> The real Matchday 1 results come pre-loaded, so your groups and knockout already reflect the actual tournament, with no more clinging to teams that already crashed out. You get an accurate bracket and a clean slate for Matchday 2 onward, where most of the points still live. <em>(You’ll start fresh at 0 — worth it when your current bracket’s hurting.)</em>";
  else
    advice = "Starting now, your bracket comes pre-loaded with the real Matchday 1 results, so you’re picking Matchday 2 onward from an accurate, up-to-date base. You’re not behind on the part that matters most — it’s all still to play for.";

  const md2Heading =
    d.tier === "low"
      ? "Matchday 2 starts today — and here’s your edge:"
      : d.tier === "empty"
        ? "Matchday 2 starts today — perfect time to jump in:"
        : "Matchday 2 starts today.";

  const body =
    P(`Hey ${esc(d.firstName)},`) +
    P(intro) +
    P(standing) +
    stats +
    poolsBlock +
    P(`<strong>${md2Heading}</strong>`, "margin-bottom:6px") +
    `<div style="font-size:15px;line-height:1.55;margin:0 0 20px">• ${editable}<br/><br/>• ${advice}</div>` +
    `<a href="${APP_URL}" style="display:block;background:#db2777;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px;border-radius:10px;font-size:15px">Open Bracket Machine →</a>` +
    P(`Good luck out there ⚽<br/>— Akhil, Bracket Machine`, "font-size:14px;margin:20px 0 0;color:#475569");

  return `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px;padding:28px 24px;text-align:center;color:#fff">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.9;font-weight:bold">Bracket Machine</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">${headline}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;color:#0f172a">${body}</div>
    <p style="text-align:center;color:#64748b;font-size:11px;line-height:1.6;margin-top:18px">
      You’re getting this because you signed up at bracketmachine.app.<br/>
      <a href="${unsub}" style="color:#94a3b8">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

// ── "Last day of the group stage" broadcast ───────────────────────────────
// Personalized standings (rank/points/pools, same source as the recap) PLUS the
// hard lock times: group picks lock per-match as today's final games kick off, and
// the whole knockout bracket freezes when the Round of 32 begins. Reuses RecapData
// + the leaderboard snapshot; cron-fired on the final group-stage morning.
export const GROUPFINAL_KEY = "groupfinal-v1";
export const GROUPFINAL_SEND_AT_ISO = "2026-06-27T15:00:00Z"; // 8am PDT, Jun 27

// The knockout bracket locks at the first Round-of-32 kickoff — KNOCKOUT_START_ISO
// (lib/results) = 2026-06-28T19:00Z = noon PT / 3pm ET. Spelled out for the email.
const KO_LOCK_LABEL = "Sunday, June 28 · 12 PM PT (3 PM ET)";

export function groupFinalSubject(d: RecapData): string {
  return d.tier === "empty"
    ? "Last day of the group stage — get your bracket in"
    : `Last call: you’re #${d.rank} of ${d.total} — your bracket locks tomorrow`;
}

export function groupFinalHtml(d: RecapData): string {
  const unsub = unsubUrl(d.userId);
  const P = (html: string, extra = "") =>
    `<p style="font-size:15px;line-height:1.55;margin:0 0 16px;${extra}">${html}</p>`;

  const headline =
    d.tier === "empty"
      ? "⚽ Last day of the group stage"
      : `${d.tier === "top" ? "🔥" : d.tier === "mid" ? "👀" : "💪"} Last call — you’re #${d.rank} of ${d.total}`;

  const name = esc(d.bracketName) || "your bracket";
  let standing: string;
  if (d.tier === "top")
    standing = `<strong>🔥 You’re near the top.</strong> Your best bracket, <strong>${name}</strong>, is <strong>#${d.rank} of ${d.total}</strong> — the top <strong>${Math.max(1, 100 - d.percentile)}%</strong>. Heading into the knockouts, don’t touch a thing.`;
  else if (d.tier === "mid")
    standing = `<strong>👀 You’re in the hunt.</strong> <strong>${name}</strong> sits <strong>#${d.rank} of ${d.total}</strong>. One last look before the group stage locks — then it’s all knockouts.`;
  else if (d.tier === "low")
    standing = `<strong>💪 Ground to make up.</strong> <strong>${name}</strong> is <strong>#${d.rank} of ${d.total}</strong> — but the knockouts are where most of the points live, and your bracket there isn’t locked yet.`;
  else
    standing = `<strong>🫥 Your bracket’s still empty</strong> at 0 points. The group games are wrapping up, but you can still pick the <strong>entire knockout bracket</strong> before it locks — that’s the bulk of the points, all still up for grabs.`;

  const stats =
    d.tier === "empty"
      ? ""
      : P(
          `📊 <strong>${d.points} pts</strong> · <strong>${d.exact}</strong> exact scoreline${d.exact === 1 ? "" : "s"} nailed · ${ordinal(d.percentile)} percentile.`,
          "background:#f1f5f9;border-radius:10px;padding:10px 14px;font-size:14px",
        );

  const poolsBlock = d.pools.length
    ? P(`<strong>🏆 Your pools</strong>`, "margin-bottom:6px") +
      `<div style="font-size:15px;line-height:1.7;margin:0 0 16px">${d.pools
        .map((p) => `• ${esc(p.name)} — <strong>#${p.rank} of ${p.members}</strong>${p.rank === 1 ? " 🥇" : ""}`)
        .join("<br/>")}</div>`
    : "";

  const locks =
    P(`<strong>⏰ This is your last chance to change anything:</strong>`, "margin-bottom:6px") +
    `<div style="font-size:15px;line-height:1.55;margin:0 0 20px">` +
    `• <strong>Group picks</strong> lock as each of today’s final games kicks off — set your last scorelines now.<br/><br/>` +
    `• <strong>Your whole knockout bracket</strong> (Round of 32 → Champion) locks when the knockouts begin: <strong>${KO_LOCK_LABEL}</strong>. After that it’s frozen for the rest of the tournament.` +
    `</div>`;

  const body =
    P(`Hey ${esc(d.firstName)},`) +
    P("The final group games kick off today — the group stage is almost done, and the knockouts start tomorrow with no real gap in between.") +
    P(standing) +
    stats +
    poolsBlock +
    locks +
    `<a href="${APP_URL}" style="display:block;background:#db2777;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px;border-radius:10px;font-size:15px">Lock in your bracket →</a>` +
    P(`Good luck out there ⚽<br/>— Akhil, Bracket Machine`, "font-size:14px;margin:20px 0 0;color:#475569");

  return `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px;padding:28px 24px;text-align:center;color:#fff">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.9;font-weight:bold">Bracket Machine</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">${headline}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;color:#0f172a">${body}</div>
    <p style="text-align:center;color:#64748b;font-size:11px;line-height:1.6;margin-top:18px">
      You’re getting this because you signed up at bracketmachine.app.<br/>
      <a href="${unsub}" style="color:#94a3b8">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

// ── Second-chance bracket promo (ESPN-style "need another chance?") ─────────
// Uniform promo to every signed-up email (first-name greeting only — no standings,
// so it can send the moment the group stage settles). Pitches all our features:
// real-R32 seed, Double-or-Nothing, the global second-chance leaderboard, + pools.
// Sent the evening the group stage ends, before the R32 lockout.
export const SECONDCHANCE_KEY = "secondchance-v1";
// 2h after the last group match kicks off (M69/M70, Group J, 02:00Z Jun 28) — i.e.
// roughly when the group stage finishes. 9pm PT Jun 27.
export const SECONDCHANCE_SEND_AT_ISO = "2026-06-28T04:00:00Z";

export function secondChanceSubject(): string {
  return "Bracket busted? You’ve got a second chance 🔄";
}

export function secondChanceHtml(firstName: string, userId: string): string {
  const unsub = unsubUrl(userId);
  const P = (html: string, extra = "") =>
    `<p style="font-size:15px;line-height:1.55;margin:0 0 16px;${extra}">${html}</p>`;
  const FEATURE = (emoji: string, title: string, text: string, tag = "") =>
    `<div style="margin:0 0 16px;padding:14px 16px;background:#f8fafc;border-radius:12px">` +
    `<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px">${emoji} ${title}` +
    (tag ? ` <span style="font-size:10px;font-weight:800;color:#fff;background:#db2777;border-radius:6px;padding:2px 6px;vertical-align:middle">${tag}</span>` : "") +
    `</div><div style="font-size:14px;line-height:1.5;color:#334155">${text}</div></div>`;

  const KO_LOCK = "Sunday, June 28 · 12 PM PT (3 PM ET)";

  const body =
    P(`Hey ${esc(firstName)},`) +
    P(
      "The group stage is done and your original bracket is locked in for good. Didn’t go your way? <strong>You’re not out of it.</strong> Here’s a clean slate for the entire knockout run:",
    ) +
    FEATURE(
      "🔄",
      "A Second-Chance bracket",
      "It starts from the <strong>real Round of 32</strong>, the actual 32 teams that made it through. You pick every winner from there to the Champion. No group stage, pure knockout, and everyone starts level.",
    ) +
    FEATURE(
      "⚡",
      "Double or Nothing",
      "Once per round, stake a single pick. Nail it and that round’s points <strong>double</strong>. Miss it and you <strong>lose</strong> them. Feeling sure about an upset? Ride it. Rather play safe? Stake nothing. Your call, every round.",
      "NEW",
    ) +
    FEATURE(
      "🏆",
      "Two ways to compete",
      "Climb the brand-new <strong>global Second-Chance leaderboard</strong> against every other player, no friends required. Or spin up a <strong>pool</strong> and run a knockout league with your group chat.",
      "NEW",
    ) +
    P(
      `⏱️ <strong>You’ve got to move fast.</strong> A Second-Chance bracket locks the moment the Round of 32 kicks off: <strong>${KO_LOCK}</strong>. Once it does, it’s frozen for the rest of the tournament, so build yours and lock it in before then.`,
      "background:#fff7ed;border-radius:10px;padding:12px 14px;font-size:14px",
    ) +
    `<a href="${APP_URL}" style="display:block;background:#db2777;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px;border-radius:10px;font-size:15px">Build your Second-Chance bracket →</a>` +
    P(`Back in it ⚽<br/>— Akhil, Bracket Machine`, "font-size:14px;margin:20px 0 0;color:#475569");

  return `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px;padding:28px 24px;text-align:center;color:#fff">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.9;font-weight:bold">Bracket Machine</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">Need another shot at it?</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;color:#0f172a">${body}</div>
    <p style="text-align:center;color:#64748b;font-size:11px;line-height:1.6;margin-top:18px">
      You’re getting this because you signed up at bracketmachine.app.<br/>
      <a href="${unsub}" style="color:#94a3b8">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Send via Resend's batch endpoint in chunks of ≤100 (the per-batch cap). Provider
 *  rate-limits bursts, so we pause between batches and back off on 429 (honoring
 *  Retry-After) — that way a list of >100 still fully sends, one ~100-email burst at
 *  a time. */
export async function sendBatch(
  emails: { to: string; subject: string; html: string }[],
): Promise<{ sent: number; failed: number }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, failed: emails.length };
  const from = process.env.REMINDER_FROM ?? "Bracket Machine <onboarding@resend.dev>";
  let sent = 0;
  let failed = 0;
  const chunks: typeof emails[] = [];
  for (let i = 0; i < emails.length; i += 100) chunks.push(emails.slice(i, i + 100));

  for (let c = 0; c < chunks.length; c++) {
    if (c > 0) await sleep(2000); // breathing room between ~100-email bursts
    const chunk = chunks[c];
    const body = JSON.stringify(chunk.map((e) => ({ from, to: e.to, subject: e.subject, html: e.html })));
    let ok = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${RESEND_URL}/batch`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body,
        });
        if (r.ok) {
          ok = chunk.length;
          break;
        }
        if (r.status === 429) {
          // Rate-limited burst — wait for it to reset, then retry the same chunk.
          const ra = Number(r.headers.get("retry-after")) || 10;
          await sleep(Math.min(ra, 30) * 1000);
          continue;
        }
        break; // other error → don't hammer
      } catch {
        break;
      }
    }
    sent += ok;
    failed += chunk.length - ok;
  }
  return { sent, failed };
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
