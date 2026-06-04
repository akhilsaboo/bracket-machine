import { createClient } from "@supabase/supabase-js";
import { verifyUnsub } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click unsubscribe from the reminder emails. Token = HMAC(userId), so a link
// can only unsubscribe its own recipient. Sets profiles.email_opt_out.
function page(message: string): Response {
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
    <div style="text-align:center;max-width:400px;padding:24px">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#db2777;font-weight:bold">Bracket Machine</div>
      <p style="font-size:16px;margin-top:12px">${message}</p>
      <a href="https://bracketmachine.app" style="color:#94a3b8;font-size:13px">← Back to Bracket Machine</a>
    </div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!verifyUnsub(u, t)) return page("That unsubscribe link isn't valid.");

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !key) return page("Couldn't process that right now — please try again later.");

  const sb = createClient(sbUrl, key);
  const { error } = await sb.from("profiles").update({ email_opt_out: true }).eq("id", u);
  if (error) return page("Couldn't process that right now — please try again later.");
  return page("You're unsubscribed from reminder emails. You won't get any more.");
}
