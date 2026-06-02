"use client";

import { useState } from "react";

interface Step {
  emoji: string;
  title: string;
  body: string;
}

// A quick first-run walkthrough. Kept short on purpose — it's a nudge, not a manual.
const STEPS: Step[] = [
  {
    emoji: "🏆",
    title: "Welcome to Bracket Machine",
    body: "Build your 2026 World Cup bracket and call the tournament. Here's the 20-second tour — skip anytime.",
  },
  {
    emoji: "⚽",
    title: "Pick every group match",
    body: "Tap a winner or type a score for each group-stage match. Standings recompute instantly with the full FIFA tiebreakers.",
  },
  {
    emoji: "🧩",
    title: "Your bracket builds itself",
    body: "The knockout bracket fills in automatically from your group results. Advance teams round by round and crown a champion.",
  },
  {
    emoji: "⚡",
    title: "In a hurry? Auto-fill it",
    body: "Don't want to click through 72 matches? Let an AI persona fill the whole bracket — then tweak anything you like.",
  },
  {
    emoji: "🔮",
    title: "Predictions & Pools",
    body: "Call the Winner, Golden Boot and more against live odds in Predictions — then create or join a Pool to compete with friends.",
  },
];

export function WelcomeTour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex justify-end px-3 pt-3">
          <button
            onClick={onDone}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Skip
          </button>
        </div>
        <div className="brand-gradient mx-5 mb-4 flex h-24 items-center justify-center rounded-xl text-5xl">
          {step.emoji}
        </div>
        <div className="px-6 pb-2 text-center">
          <h3 className="text-lg font-extrabold">{step.title}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{step.body}</p>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-4 bg-[var(--wc-accent)]" : "w-1.5 bg-slate-300 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2 p-5">
          {i > 0 && (
            <button
              onClick={() => setI((v) => v - 1)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Back
            </button>
          )}
          <button
            onClick={() => (last ? onDone() : setI((v) => v + 1))}
            className="flex-1 rounded-md bg-[var(--wc-accent)] px-3 py-2 text-sm font-bold text-white transition hover:opacity-90"
          >
            {last ? "Let's go →" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
