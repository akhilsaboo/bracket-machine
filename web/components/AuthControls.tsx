"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuth } from "@/lib/auth";

function GoogleG({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.8-1.9 13.4-5.1l-6.2-5c-2 1.4-4.5 2.1-7.2 2.1-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 39.7 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5c-.4.4 6.7-4.9 6.7-14.7 0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Avatar({ name, url, size = 24 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full ring-2 ring-white/30"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = name.charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-white text-[var(--wc-accent)] ring-2 ring-white/30"
      style={{ width: size, height: size, fontSize: size * 0.5, fontWeight: 800 }}
    >
      {initial}
    </div>
  );
}

export function AuthControls() {
  const { user, ready, signInPromptCount, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Remote requests to sign in (e.g. from a "Sign in to submit" button) open the popover.
  useEffect(() => {
    if (signInPromptCount > 0 && !user) setOpen(true);
  }, [signInPromptCount, user]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!isSupabaseConfigured() || !ready) return null;

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  const signInGoogle = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setError(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const fn =
      mode === "in"
        ? sb.auth.signInWithPassword({ email, password })
        : sb.auth.signUp({ email, password });
    const { data, error } = await fn;
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mode === "up" && !data.session) {
      setNotice("Account created — check your email to confirm, then sign in.");
      return;
    }
    setOpen(false);
    setEmail("");
    setPassword("");
  };

  // --- Signed in: avatar pill + dropdown ---
  if (user) {
    const name =
      ((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "You");
    const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;

    return (
      <div ref={boxRef} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-sm font-medium transition hover:bg-white/25"
        >
          <Avatar name={name} url={avatarUrl} size={26} />
          <span className="hidden max-w-[140px] truncate sm:inline">{name}</span>
          <svg className="h-3 w-3 opacity-80" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
              <Avatar name={name} url={avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{name}</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Signed out: sign-in / create-account popover ---
  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-white/90"
      >
        Sign in
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 z-30 mt-2 w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <button
            type="button"
            onClick={signInGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <GoogleG /> Continue with Google
          </button>
          <div className="flex items-center gap-2 text-[10px] uppercase text-slate-400">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="flex gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("in")}
              className={`flex-1 rounded-md py-1 ${mode === "in" ? "bg-[var(--wc-accent)] text-white" : "bg-slate-100 dark:bg-slate-800"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("up")}
              className={`flex-1 rounded-md py-1 ${mode === "up" ? "bg-[var(--wc-accent)] text-white" : "bg-slate-100 dark:bg-slate-800"}`}
            >
              Create account
            </button>
          </div>
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--wc-accent)] dark:border-slate-700 dark:bg-slate-800"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[var(--wc-accent)] dark:border-slate-700 dark:bg-slate-800"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {notice && <p className="text-xs text-emerald-600">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[var(--wc-accent)] py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
      )}
    </div>
  );
}
