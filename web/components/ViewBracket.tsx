"use client";

import { useEffect, useState } from "react";
import { GROUP_IDS } from "@/lib/data";
import { useTournament } from "@/lib/liveResults";
import {
  ReadOnlyPredictions,
  usePredictions,
  type KnockoutWinners,
  type Predictions,
} from "@/lib/predictions";
import { resolveKnockout } from "@/lib/knockout";
import { withResults } from "@/lib/compute";
import { knockoutGrader } from "@/lib/scoring";
import { GroupCard } from "./GroupCard";
import { ScheduleView } from "./ScheduleView";
import { BracketTree } from "./BracketTree";

interface Masked {
  name: string;
  bracketName: string;
  predictions: Predictions;
  knockout: KnockoutWinners;
  tiebreakerGoals: number | null;
}

type ViewTab = "group" | "schedule" | "bracket";
const TABS: { id: ViewTab; label: string }[] = [
  { id: "group", label: "Group" },
  { id: "schedule", label: "Schedule" },
  { id: "bracket", label: "Bracket" },
];

/**
 * Full-tab read-only takeover: browse someone else's bracket through the exact
 * same Group / Schedule / Bracket views, fed their LOCK-MASKED picks (from
 * /api/view-bracket) and made non-interactive. Picks reveal per-kickoff, so future
 * games show empty — you can never see an unlocked pick.
 */
export function ViewBracket({
  bracketId,
  name,
  bracketName,
  onClose,
}: {
  bracketId: string;
  name: string;
  bracketName: string;
  onClose: () => void;
}) {
  const { now, isPreview } = usePredictions();
  const { truth, bracketResults } = useTournament(now, isPreview);
  const [data, setData] = useState<Masked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("group");

  useEffect(() => {
    let on = true;
    setData(null);
    setError(null);
    fetch(`/api/view-bracket?id=${encodeURIComponent(bracketId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Masked>) : Promise.reject(new Error(`Error ${r.status}`))))
      .then((d) => on && setData(d))
      .catch((e) => on && setError(e.message));
    return () => {
      on = false;
    };
  }, [bracketId]);

  const resolved = data
    ? resolveKnockout(withResults(data.predictions, bracketResults), data.knockout)
    : null;
  const gradePick = truth ? knockoutGrader(truth) : undefined;

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--wc-accent)]/40 bg-[var(--wc-accent)]/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--wc-accent)]">
            <span>👁 Viewing</span>
            <span className="truncate text-slate-800 dark:text-slate-100">{name}</span>
          </div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            “{bracketName}” · read-only · picks reveal as each match kicks off
            {data?.tiebreakerGoals != null && (
              <> · tiebreaker {data.tiebreakerGoals} goals</>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-full bg-[var(--wc-accent)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
        >
          ✕ Exit view
        </button>
      </div>

      {/* Read-only tab bar */}
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? "border-x border-t border-slate-200 bg-[var(--background)] text-[var(--wc-accent)] dark:border-slate-800"
                : "text-slate-500 hover:bg-slate-500/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="py-12 text-center text-sm text-red-500">Couldn’t load this bracket.</p>
      ) : !data ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <ReadOnlyPredictions
          predictions={data.predictions}
          knockout={data.knockout}
          tiebreakerGoals={data.tiebreakerGoals}
        >
          {/* pointer-events-none → the exact views, but nothing is editable. */}
          <div className="pointer-events-none select-none">
            {tab === "group" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {GROUP_IDS.map((g) => (
                  <GroupCard key={g} group={g} />
                ))}
              </div>
            )}
            {tab === "schedule" && <ScheduleView />}
            {tab === "bracket" &&
              (resolved ? (
                <BracketTree resolved={resolved} gradePick={gradePick} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {name} hasn’t completed a full bracket yet
                    {/* knockout is hidden until the stage locks */}.
                  </p>
                </div>
              ))}
          </div>
        </ReadOnlyPredictions>
      )}
    </div>
  );
}
