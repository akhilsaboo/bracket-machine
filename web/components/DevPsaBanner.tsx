"use client";

import { useEffect, useState } from "react";

// Dismissible "message from the dev" PSA. Bump the version in the key to re-show a
// new message to everyone who'd dismissed the old one.
const DISMISS_KEY = "wc2026-recap-md1-v1";

export function DevPsaBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);
  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--wc-accent)]/30 bg-[var(--wc-accent)]/5 px-4 py-3">
      <span className="text-lg leading-none">📣</span>
      <p className="flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        <span className="font-bold">Matchday 1 is done</span> — every team has played once, with two
        group games to go before the knockouts, and the next round starts today. Your picks stay open
        until each match kicks off, and starting a fresh bracket picks up from the current standings.
        Check your inbox for your personal recap. Good luck! ⚽
      </p>
      <button
        onClick={dismiss}
        title="Dismiss"
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
      >
        ✕
      </button>
    </div>
  );
}
