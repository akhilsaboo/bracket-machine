"use client";

import { useEffect, useMemo, useState } from "react";
import { pickProgress } from "@/lib/compute";
import { SCHEDULE } from "@/lib/data";
import { scoreEverything, scoreSecondChance } from "@/lib/scoring";
import { usePredictions } from "@/lib/predictions";
import { useTournament } from "@/lib/liveResults";
import { isKnockoutStarted } from "@/lib/results";

const SC_BANNER_DISMISSED_KEY = "wc2026-sc-banner-dismissed";
const RESET_CONFIRM_SKIP_KEY = "wc2026-skip-reset-confirm";

// TEMP dev-only clock override so we can test locking/reset against different
// moments in the tournament. Remove when done testing.
const PREVIEW_PRESETS: { label: string; iso: string | null }[] = [
  { label: "Live (real time)", iso: null },
  { label: "Mid group stage", iso: "2026-06-18T12:00:00Z" },
  { label: "Knockout started", iso: "2026-06-29T00:00:00Z" },
  { label: "After final", iso: "2026-07-20T00:00:00Z" },
];
import { GroupStageView } from "@/components/GroupStageView";
import { ScheduleView } from "@/components/ScheduleView";
import { BracketView } from "@/components/BracketView";
import { AuthControls } from "@/components/AuthControls";
import { BracketSync } from "@/components/BracketSync";
import { PoolsView } from "@/components/PoolsView";
import { PoolJoinHandler } from "@/components/PoolJoinHandler";
import { BracketSwitcher } from "@/components/BracketSwitcher";
import { PredictionsView } from "@/components/PredictionsView";
import { GlobalLeaderboard } from "@/components/GlobalLeaderboard";
import { ViewBracket } from "@/components/ViewBracket";
import { DevPsaBanner } from "@/components/DevPsaBanner";

type Tab = "group" | "schedule" | "bracket" | "awards" | "pools" | "leaderboard";
interface Viewing {
  bracketId: string;
  userId: string;
  name: string;
  bracketName: string;
}
const TABS: { id: Tab; label: string }[] = [
  { id: "group", label: "Group Stage" },
  { id: "schedule", label: "Schedule" },
  { id: "bracket", label: "Bracket" },
  { id: "awards", label: "Predictions" },
  { id: "pools", label: "Pools" },
  { id: "leaderboard", label: "Leaderboard" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("group");
  // When set, the main area is taken over by a read-only view of someone else's
  // bracket (opened from the leaderboard). Clicking any top tab exits it.
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const { predictions, knockout, boosts, reset, hydrated, activeKind, isPreview, now, brackets, createBracket, switchBracket, setPreviewNow } =
    usePredictions();
  const [scDismissed, setScDismissed] = useState(false);
  // TEMP dev clock override selection. Remove with the selector below.
  const [previewSel, setPreviewSel] = useState("");
  useEffect(() => {
    setScDismissed(localStorage.getItem(SC_BANNER_DISMISSED_KEY) === "1");
  }, []);

  // Reset confirmation (with a "don't ask again" opt-out).
  const [pendingReset, setPendingReset] = useState(false);
  const [dontAskReset, setDontAskReset] = useState(false);
  const handleReset = () => {
    if (localStorage.getItem(RESET_CONFIRM_SKIP_KEY) === "1") reset();
    else setPendingReset(true);
  };
  const confirmReset = () => {
    if (dontAskReset) localStorage.setItem(RESET_CONFIRM_SKIP_KEY, "1");
    reset();
    setPendingReset(false);
  };

  // Picks made vs. picks still available — already-played matches a late joiner
  // couldn't pick are excluded, so this reads e.g. "70/70" instead of a stuck 70/72.
  const [picksMade, picksTotal] = pickProgress(predictions, now);

  const isSecondChance = activeKind === "second_chance";
  // Group tab is irrelevant for a knockout-only second-chance bracket.
  const tabs = TABS.filter((t) => !(isSecondChance && t.id === "group"));
  const effectiveTab: Tab = isSecondChance && tab === "group" ? "bracket" : tab;

  // Single tournament read (real ESPN feed, or preview mock).
  const tournament = useTournament(now, isPreview);
  // Active bracket's live score — same scoring the leaderboard uses — for the
  // header points badge. Normal brackets only (second-chance has its own scoring).
  const totalPoints = useMemo(
    () =>
      isSecondChance
        ? scoreSecondChance(knockout, tournament.round32, tournament.truth, boosts).points
        : scoreEverything(predictions, knockout, SCHEDULE, (f) => tournament.groupResultFor(f), tournament.truth)
            .total,
    [isSecondChance, predictions, knockout, boosts, tournament],
  );

  // Once the real R32 is known, surface second-chance brackets — but never
  // duplicate: if one already exists the banner opens it instead of creating.
  const r32Ready = tournament.round32 !== null;
  // Offer a second chance only in the window it's actually usable: after the group
  // stage seeds the real R32, and BEFORE the Round of 32 kicks off and locks it.
  const showSCBanner = r32Ready && !isKnockoutStarted(now) && !isSecondChance && !scDismissed;

  const dismissSCBanner = () => {
    localStorage.setItem(SC_BANNER_DISMISSED_KEY, "1");
    setScDismissed(true);
  };

  const handleSCBanner = () => {
    // Each click starts a FRESH second-chance bracket — you can run several, just
    // like your normal brackets. They appear in the switcher with a 🔄 label.
    const rec = createBracket({ name: "Second Chance", kind: "second_chance" });
    if (rec) switchBracket(rec.id);
    setTab("bracket");
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Bracket Machine"
              // Circular-cropped transparent PNG — vivid emblem, dark outer ring,
              // gradient showing through the corners. A touch of saturation pops the blue.
              style={{ filter: "saturate(1.2) contrast(1.05)" }}
              className="-ml-1 h-20 w-20 shrink-0 self-center drop-shadow sm:h-24 sm:w-24"
            />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                World Cup 2026 Bracket Machine
              </h1>
              <p className="text-xs text-white/80">
                Pick every score. Your bracket builds itself — full FIFA tiebreakers, live.
              </p>
            </div>
            {hydrated && (
              <span
                title="Your active bracket's score against the real results so far"
                className="self-center rounded-full bg-white/20 px-3 py-1.5 text-base font-extrabold tabular-nums shadow-sm ring-1 ring-white/20"
              >
                🏆 {totalPoints}
                <span className="ml-1 text-xs font-medium text-white/80">pts</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium tabular-nums">
              {hydrated ? `${picksMade}/${picksTotal} picks` : "…"}
            </span>
            <BracketSwitcher />
            {/* TEMP dev clock override — localhost only, excluded from prod builds. */}
            {process.env.NODE_ENV === "development" && (
              <select
                title="Preview the app at a different moment (dev only)"
                value={previewSel}
                onChange={(e) => {
                  setPreviewSel(e.target.value);
                  setPreviewNow(e.target.value || null);
                }}
                className="rounded-full bg-white/15 px-2 py-1 text-xs font-medium text-white [&>option]:text-slate-800"
              >
                {PREVIEW_PRESETS.map((p) => (
                  <option key={p.label} value={p.iso ?? ""}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleReset}
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
              onClick={() => {
                setViewing(null);
                setTab(t.id);
              }}
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
        {!viewing && <DevPsaBanner />}
        {showSCBanner && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-[var(--wc-accent)]/30 bg-[var(--wc-accent)]/5 pr-2">
            <button
              onClick={handleSCBanner}
              className="flex flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-sm font-bold">
                  🔄 Want another chance?
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Complete a second-chance bracket from the real Round of 32. Lock it in before the knockouts start.
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
        {viewing ? (
          <ViewBracket
            bracketId={viewing.bracketId}
            userId={viewing.userId}
            name={viewing.name}
            bracketName={viewing.bracketName}
            onClose={() => setViewing(null)}
          />
        ) : (
          <>
            {effectiveTab === "group" && <GroupStageView onSubmitted={() => setTab("bracket")} />}
            {effectiveTab === "schedule" && <ScheduleView />}
            {effectiveTab === "bracket" && <BracketView onGoToPools={() => setTab("pools")} />}
            {effectiveTab === "awards" && <PredictionsView />}
            {effectiveTab === "pools" && <PoolsView onGoToGroupTab={() => setTab("group")} />}
            {effectiveTab === "leaderboard" && (
              <GlobalLeaderboard
                onViewBracket={(b) => {
                  setViewing(b);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
          </>
        )}
      </main>

      {pendingReset && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 text-slate-800 dark:text-slate-100"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingReset(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-bold">Reset this bracket?</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              This clears your picks for games that haven&apos;t kicked off yet. Picks for matches
              that have already started or finished stay put. This can&apos;t be undone.
            </p>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={dontAskReset} onChange={(e) => setDontAskReset(e.target.checked)} />
              Don&apos;t ask me again
            </label>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPendingReset(false)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
