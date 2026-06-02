"use client";

import { useEffect, useState } from "react";
import { SCHEDULE } from "@/lib/data";
import { usePredictions } from "@/lib/predictions";
import { realRound32 } from "@/lib/results";

const SC_BANNER_DISMISSED_KEY = "wc2026-sc-banner-dismissed";
import { GroupStageView } from "@/components/GroupStageView";
import { ScheduleView } from "@/components/ScheduleView";
import { BracketView } from "@/components/BracketView";
import { AuthControls } from "@/components/AuthControls";
import { BracketSync } from "@/components/BracketSync";
import { PoolsView } from "@/components/PoolsView";
import { PoolJoinHandler } from "@/components/PoolJoinHandler";
import { BracketSwitcher } from "@/components/BracketSwitcher";
import { PredictionsView } from "@/components/PredictionsView";

type Tab = "group" | "schedule" | "bracket" | "awards" | "pools";
const TABS: { id: Tab; label: string }[] = [
  { id: "group", label: "Group Stage" },
  { id: "schedule", label: "Schedule" },
  { id: "bracket", label: "Bracket" },
  { id: "awards", label: "Predictions" },
  { id: "pools", label: "Pools" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("group");
  const { predictions, reset, hydrated, activeKind, isPreview, now, brackets, createBracket, switchBracket } =
    usePredictions();
  const [scDismissed, setScDismissed] = useState(false);
  useEffect(() => {
    setScDismissed(localStorage.getItem(SC_BANNER_DISMISSED_KEY) === "1");
  }, []);

  const predicted = SCHEDULE.filter((f) => {
    const s = predictions[f.id];
    return s && s.home !== null && s.away !== null;
  }).length;

  const isSecondChance = activeKind === "second_chance";
  // Group tab is irrelevant for a knockout-only second-chance bracket.
  const tabs = TABS.filter((t) => !(isSecondChance && t.id === "group"));
  const effectiveTab: Tab = isSecondChance && tab === "group" ? "bracket" : tab;

  // Once the real R32 is known, surface second-chance brackets — but never
  // duplicate: if one already exists the banner opens it instead of creating.
  const r32Ready = realRound32(now, isPreview) !== null;
  const existingSC = brackets.find((b) => b.kind === "second_chance");
  const showSCBanner = r32Ready && !isSecondChance && !scDismissed;

  const dismissSCBanner = () => {
    localStorage.setItem(SC_BANNER_DISMISSED_KEY, "1");
    setScDismissed(true);
  };

  const handleSCBanner = () => {
    if (existingSC) {
      switchBracket(existingSC.id);
    } else {
      const rec = createBracket({ name: "Second Chance", kind: "second_chance" });
      if (rec) switchBracket(rec.id);
    }
    setTab("bracket");
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
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-[var(--wc-accent)]/30 bg-[var(--wc-accent)]/5 pr-2">
            <button
              onClick={handleSCBanner}
              className="flex flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-sm font-bold">
                  🔄 {existingSC ? "Open your Second-Chance bracket" : "Group stage is done — try a Second-Chance bracket"}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {existingSC
                    ? "Knockout-only, seeded from the real Round of 32."
                    : "Start from the real Round of 32 and fill a knockout-only bracket. Up to 25 brackets — make more anytime from the switcher."}
                </span>
              </span>
              <span className="shrink-0 text-[var(--wc-accent)]">→</span>
            </button>
            <button
              onClick={dismissSCBanner}
              title="Dismiss"
              className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        )}
        {effectiveTab === "group" && <GroupStageView onSubmitted={() => setTab("bracket")} />}
        {effectiveTab === "schedule" && <ScheduleView />}
        {effectiveTab === "bracket" && <BracketView />}
        {effectiveTab === "awards" && <PredictionsView />}
        {effectiveTab === "pools" && <PoolsView onGoToGroupTab={() => setTab("group")} />}
      </main>
    </div>
  );
}
