"use client";

// One-time "what should we call you?" prompt, shown the first time a signed-in
// user opens the Pools tab. Pre-filled with their best-guess name (Google name,
// else email prefix). Saves to profiles.display_name; editable later from the
// account menu. Self-gates on a localStorage flag so it only appears once.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useProfile, MAX_NAME_LEN } from "@/lib/profile";

const SEEN_KEY = "wc2026-name-prompt-seen";

export function DisplayNamePrompt() {
  const { user } = useAuth();
  const { displayName, ready, updateDisplayName } = useProfile();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !ready || typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_KEY)) return;
    setValue(displayName === "You" ? "" : displayName);
    setOpen(true);
  }, [user, ready, displayName]);

  if (!open) return null;

  // Empty name → just dismiss (keep whatever's stored). Non-empty → persist it.
  const finish = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed) {
      setBusy(true);
      setError(null);
      const err = await updateDisplayName(trimmed);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }
    }
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="brand-gradient p-5 text-center text-white">
          <div className="text-3xl leading-none">👋</div>
          <div className="mt-1 text-lg font-extrabold">What should we call you?</div>
          <div className="text-xs opacity-90">This is the name your friends see on pool leaderboards.</div>
        </div>
        <div className="space-y-3 p-5">
          <input
            autoFocus
            value={value}
            maxLength={MAX_NAME_LEN}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--wc-accent)] dark:border-slate-700 dark:bg-slate-800"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            disabled={busy || !value.trim()}
            onClick={() => finish(value)}
            className="w-full rounded-md bg-[var(--wc-accent)] px-3 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Looks good →"}
          </button>
          <button
            onClick={() => finish(displayName === "You" ? "" : displayName)}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
