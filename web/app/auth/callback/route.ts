// Server-side OAuth callback. PKCE requires the code verifier (stored as a cookie
// by the browser at signInWithOAuth) to be read on the server during code exchange;
// the old client-side page couldn't see it. @supabase/ssr's server client handles it.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");

  if (!code) {
    const dest = errorParam ? `/?auth=${encodeURIComponent(errorParam)}` : "/";
    return NextResponse.redirect(new URL(dest, url.origin));
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL("/?auth=not-configured", url.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const c of toSet) cookieStore.set(c.name, c.value, c.options);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/?auth=${encodeURIComponent(error.message)}`, url.origin),
    );
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
