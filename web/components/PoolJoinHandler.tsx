"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { joinPoolByCode } from "@/lib/pools";

// localStorage key used to survive the OAuth round-trip (Google sign-in
// redirects away from the page and back; query params are lost, but
// localStorage persists).
const PENDING_KEY = "wc2026-pending-join";

export function PoolJoinHandler({ onJoined }: { onJoined: () => void }) {
  const { user, requestSignIn } = useAuth();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [poolName, setPoolName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  // While the AuthControls sign-in popover is open, hide our modal so the two
  // don't overlap. Stays hidden until success/error reaches a terminal state.
  const [hidden, setHidden] = useState(false);
  const handled = useRef(false);

  // On mount: pick up a code from the URL or from a prior pending stash.
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("join");
    const code = (fromUrl || localStorage.getItem(PENDING_KEY) || "").trim().toUpperCase();
    if (!code) return;

    const sb = getSupabaseBrowser();
    if (!sb) return;
    sb.rpc("find_pool_by_invite", { code }).then(({ data, error: rpcErr }) => {
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; name: string } | null;
      if (rpcErr || !row) {
        setError("That invite code doesn't match any pool.");
        cleanupUrl();
        localStorage.removeItem(PENDING_KEY);
        return;
      }
      setPendingCode(code);
      setPoolName(row.name);
    });
  }, []);

  const cleanupUrl = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("join")) {
      url.searchParams.delete("join");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const join = useCallback(async () => {
    if (!pendingCode) return;
    if (!user) {
      // Stash so we can finish the join after sign-in, and hide this modal so
      // it doesn't sit on top of the sign-in popover.
      localStorage.setItem(PENDING_KEY, pendingCode);
      setHidden(true);
      requestSignIn();
      return;
    }
    // We're proceeding to actually join — reveal the modal for feedback.
    setHidden(false);
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const res = await joinPoolByCode(sb, pendingCode, null);
    setBusy(false);
    cleanupUrl();
    localStorage.removeItem(PENDING_KEY);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setSuccess(true);
    onJoined();
    // auto-dismiss success after 2s
    setTimeout(() => {
      setSuccess(false);
      setPendingCode(null);
      setPoolName(null);
    }, 2000);
  }, [pendingCode, user, requestSignIn, onJoined]);

  // If the user has a pending code in localStorage AND just signed in, finish the join.
  useEffect(() => {
    if (!user || !pendingCode) return;
    if (localStorage.getItem(PENDING_KEY) === pendingCode) {
      // The popover may auto-close on success; trigger join now.
      void join();
    }
  }, [user, pendingCode, join]);

  const cancel = () => {
    cleanupUrl();
    localStorage.removeItem(PENDING_KEY);
    setPendingCode(null);
    setPoolName(null);
    setError(null);
  };

  if (hidden) return null;
  if (!pendingCode && !error && !success) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {success ? (
          <div className="brand-gradient p-6 text-center text-white">
            <div className="text-3xl">🎉</div>
            <div className="mt-2 text-base font-bold">You're in!</div>
            <div className="text-xs opacity-80">Welcome to {poolName}</div>
          </div>
        ) : error ? (
          <>
            <div className="bg-red-100 p-5 text-center dark:bg-red-950/40">
              <div className="text-2xl">⚠️</div>
              <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
            </div>
            <div className="p-4">
              <button
                onClick={cancel}
                className="w-full rounded-md bg-slate-100 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Close
              </button>
            </div>
          </>
        ) : pendingCode && poolName ? (
          <>
            <div className="brand-gradient p-6 text-center text-white">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">
                You've been invited
              </div>
              <div className="mt-2 text-2xl font-extrabold">{poolName}</div>
              <div className="mt-1 text-xs opacity-80">Code: {pendingCode}</div>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user
                  ? "Join this pool and your bracket will count on its leaderboard."
                  : "Sign in (or create an account) to join. Your picks go with you."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancel}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Not now
                </button>
                <button
                  onClick={join}
                  disabled={busy}
                  className="flex-1 rounded-md bg-[var(--wc-accent)] px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "…" : user ? `Join ${poolName}` : "Sign in to join"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
