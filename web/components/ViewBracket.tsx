"use client";

import { useEffect, useState } from "react";
import { GROUP_IDS } from "@/lib/data";
import { useTournament } from "@/lib/liveResults";
import { isKnockoutStarted } from "@/lib/results";
import {
  ReadOnlyPredictions,
  usePredictions,
  type KnockoutWinners,
  type Predictions,
} from "@/lib/predictions";
import { resolveKnockout } from "@/lib/knockout";
import { withResults } from "@/lib/compute";
import { knockoutGrader } from "@/lib/scoring";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { loadMyPicks, type PicksByMarket } from "@/lib/predictionPicks";
import { FUTURES } from "@/lib/kalshi";
import { flagFromIso2 } from "@/lib/flags";
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

type ViewTab = "group" | "schedule" | "bracket" | "predictions";

/**
 * Full-tab read-only takeover: browse someone else's bracket through the exact
 * same Group / Schedule / Bracket views, fed their LOCK-MASKED picks (from
 * /api/view-bracket) and made non-interactive. Picks reveal per-kickoff, so future
 * games show empty — you can never see an unlocked pick.
 */
export function ViewBracket({
  bracketId,
  userId,
  name,
  bracketName,
  onClose,
}: {
  bracketId: string;
  /** Owner's user id — enables the read-only Predictions (futures) tab. */
  userId?: string;
  name: string;
  bracketName: string;
  onClose: () => void;
}) {
  const { now, isPreview } = usePredictions();
  const { truth, bracketResults } = useTournament(now, isPreview);
  const [data, setData] = useState<Masked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("group");
  const [picks, setPicks] = useState<PicksByMarket | null>(null);

  const tabs: { id: ViewTab; label: string }[] = [
    { id: "group", label: "Group" },
    { id: "schedule", label: "Schedule" },
    { id: "bracket", label: "Bracket" },
    ...(userId ? [{ id: "predictions" as ViewTab, label: "Predictions" }] : []),
  ];

  // Futures picks lock pre-tournament, so they're safe to show read-only.
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    let on = true;
    setPicks(null);
    loadMyPicks(sb, userId).then((p) => on && setPicks(p));
    return () => {
      on = false;
    };
  }, [userId]);

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
            “{data?.bracketName || bracketName || "Bracket"}” · read-only · picks reveal as each match kicks off
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
        {tabs.map((t) => (
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

      {tab === "predictions" ? (
        picks === null ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          (() => {
            const made = FUTURES.filter((f) => picks[f.key]);
            if (made.length === 0)
              return (
                <p className="py-12 text-center text-sm text-slate-400">
                  {name} didn’t make any futures predictions.
                </p>
              );
            return (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  {name}’s futures predictions — locked, read-only.
                </p>
                {made.map((f) => {
                  const p = picks[f.key];
                  return (
                    <div
                      key={f.key}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <span className="text-xl leading-none">{f.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{f.title}</div>
                        <div className="truncate text-xs text-slate-400">{f.subtitle}</div>
                      </div>
                      <div className="ml-auto text-right">
                        <div className="text-sm font-bold">
                          {p.flagIso2 ? `${flagFromIso2(p.flagIso2)} ` : ""}
                          {p.label}
                        </div>
                        {p.points != null && (
                          <div className="text-[10px] text-slate-400">{p.points} pts if it hits</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )
      ) : error ? (
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
                    {isKnockoutStarted(now)
                      ? `${name} didn’t fill out a full knockout bracket.`
                      : "🔒 You can’t see this yet — knockout picks stay hidden until the bracket locks when the knockout stage begins (Jun 28)."}
                  </p>
                </div>
              ))}
          </div>
        </ReadOnlyPredictions>
      )}
    </div>
  );
}
