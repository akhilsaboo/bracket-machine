"use client";

import { useState } from "react";

interface Step {
  emoji: string;
  title: string;
  body: string;
  image?: string; // optional hero image (shown instead of the emoji)
}

// A quick first-run walkthrough. One punchy line per card — it's a nudge, not a manual.
const STEPS: Step[] = [
  {
    emoji: "🏆",
    image: "/trophy.jpeg",
    title: "Welcome to Bracket Machine",
    body: "Build your 2026 World Cup bracket in just a few clicks.",
  },
  {
    emoji: "⚽",
    title: "Predict the groups",
    body: "Pick a winner or score for every group match — your standings update as you go.",
  },
  {
    emoji: "🧩",
    title: "Your bracket builds itself",
    body: "Group picks flow into the knockout bracket. Advance teams to crown your champion.",
  },
  {
    emoji: "⚡",
    title: "Short on time?",
    body: "Let an AI persona auto-fill your whole bracket — then override any pick you want.",
  },
  {
    emoji: "🔄",
    title: "Second-chance bracket",
    body: "Busted bracket? When the group stage ends, start fresh from the Round of 32.",
  },
  {
    emoji: "🔮",
    title: "Beyond the bracket",
    body: "Predict the Winner, Golden Boot, and more against live odds — separate from your bracket picks.",
  },
  {
    emoji: "👥",
    title: "Play with friends",
    body: "Create or join a pool and climb a shared leaderboard together.",
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
        <div className="brand-gradient mx-5 mb-4 flex h-32 items-center justify-center overflow-hidden rounded-xl text-5xl">
          {step.image ? (
            // screen blend removes the image's black background → brand gradient shows.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={step.image}
              alt=""
              style={{ mixBlendMode: "screen" }}
              className="h-full w-full object-contain"
            />
          ) : (
            step.emoji
          )}
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
