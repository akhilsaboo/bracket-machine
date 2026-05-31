"use client";

import { useState } from "react";
import { SCHEDULE } from "@/lib/data";
import { usePredictions } from "@/lib/predictions";
import { realRound32 } from "@/lib/results";
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
  const { predictions, reset, hydrated, activeKind, isPreview, now, createBracket, switchBracket } =
    usePredictions();

  const predicted = SCHEDULE.filter((f) => {
    const s = predictions[f.id];
    return s && s.home !== null && s.away !== null;
  }).length;

  const isSecondChance = activeKind === "second_chance";
  // Group tab is irrelevant for a knockout-only second-chance bracket.
  const tabs = TABS.filter((t) => !(isSecondChance && t.id === "group"));
  const effectiveTab: Tab = isSecondChance && tab === "group" ? "bracket" : tab;

  // The real R32 is known (group stage over). Offer a second-chance bracket.
  const r32Ready = realRound32(now, isPreview) !== null;
  const showSCBanner = r32Ready && !isSecondChance;

  const startSecondChance = () => {
    const id = createBracket({ name: "Second Chance", kind: "second_chance" });
    if (id) {
      switchBracket(id);
      setTab("bracket");
    }
  };

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
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                effectiveTab === t.id
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
        {showSCBanner && (
          <button
            onClick={startSecondChance}
            className="mb-5 flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--wc-accent)]/30 bg-[var(--wc-accent)]/5 px-4 py-3 text-left transition hover:bg-[var(--wc-accent)]/10"
          >
            <span>
              <span className="block text-sm font-bold">🔄 Group stage is done — try a Second-Chance bracket</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Start fresh from the real Round of 32 and fill out a knockout-only bracket.
              </span>
            </span>
            <span className="shrink-0 text-[var(--wc-accent)]">→</span>
          </button>
        )}
        {effectiveTab === "group" && <GroupStageView onSubmitted={() => setTab("bracket")} />}
        {effectiveTab === "schedule" && <ScheduleView />}
        {effectiveTab === "bracket" && <BracketView />}
        {effectiveTab === "pools" && <PoolsView />}
      </main>
    </div>
  );
}
