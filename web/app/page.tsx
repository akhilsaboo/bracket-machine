"use client";

import { useState } from "react";
import { SCHEDULE } from "@/lib/data";
import { usePredictions } from "@/lib/predictions";
import { GroupStageView } from "@/components/GroupStageView";
import { ScheduleView } from "@/components/ScheduleView";
import { BracketView } from "@/components/BracketView";
import { AuthControls } from "@/components/AuthControls";
import { BracketSync } from "@/components/BracketSync";
import { PoolsView } from "@/components/PoolsView";
import { PoolJoinHandler } from "@/components/PoolJoinHandler";
import { BracketSwitcher } from "@/components/BracketSwitcher";

type Tab = "group" | "schedule" | "bracket" | "pools";
const TABS: { id: Tab; label: string }[] = [
  { id: "group", label: "Group Stage" },
  { id: "schedule", label: "Schedule" },
  { id: "bracket", label: "Bracket" },
  { id: "pools", label: "Pools" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("group");
  const { predictions, reset, hydrated } = usePredictions();

  const predicted = SCHEDULE.filter((f) => {
    const s = predictions[f.id];
    return s && s.home !== null && s.away !== null;
  }).length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              World Cup 2026 Bracket Machine
            </h1>
            <p className="text-xs text-white/80">
              Pick every score. Your bracket builds itself — full FIFA tiebreakers, live.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium tabular-nums">
              {hydrated ? `${predicted}/72 predicted` : "…"}
            </span>
            <BracketSwitcher />
            <button
              onClick={reset}
              className="rounded-full bg-white/15 px-3 py-1 font-medium transition hover:bg-white/25"
            >
              Reset
            </button>
            <AuthControls />
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-[var(--background)] text-[var(--wc-accent)]"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <BracketSync />
      <PoolJoinHandler onJoined={() => setTab("pools")} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {tab === "group" && <GroupStageView onSubmitted={() => setTab("bracket")} />}
        {tab === "schedule" && <ScheduleView />}
        {tab === "bracket" && <BracketView />}
        {tab === "pools" && <PoolsView />}
      </main>
    </div>
  );
}
