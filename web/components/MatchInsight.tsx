"use client";

import { useState } from "react";
import { flag } from "@/lib/flags";
import { fetchInsight, type MatchInsight } from "@/lib/insights";

export function MatchInsightButton({
  homeCode,
  awayCode,
  className,
}: {
  homeCode: string;
  awayCode: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MatchInsight | null>(null);
  const [loading, setLoading] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      setData(await fetchInsight(homeCode, awayCode));
    } catch {
      // leave data null; modal shows a generic message
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title="Matchup insights"
        className={
          className ??
          "shrink-0 rounded p-1 text-sm text-slate-400 transition hover:text-[var(--wc-accent)]"
        }
      >
        📰
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="brand-gradient px-5 py-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">
                Matchup insight
              </div>
              <div className="mt-1 text-lg font-extrabold">
                {flag(homeCode)} {data?.homeName ?? homeCode} <span className="opacity-70">vs</span>{" "}
                {data?.awayName ?? awayCode} {flag(awayCode)}
              </div>
            </div>

            <div className="space-y-4 p-5 text-sm">
              {loading || !data ? (
                <p className="py-6 text-center text-slate-400">Generating insight…</p>
              ) : !data.configured ? (
                <p className="py-2 text-slate-500 dark:text-slate-400">
                  AI insights aren&apos;t turned on yet. Add an <code>ANTHROPIC_API_KEY</code> (and an
                  optional <code>THE_ODDS_API_KEY</code> for live odds) to enable them.
                </p>
              ) : data.error ? (
                <p className="py-2 text-slate-500 dark:text-slate-400">{data.error}</p>
              ) : (
                <>
                  {data.odds && (
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <span>Win probability</span>
                        <span className="normal-case opacity-70">{data.odds.source}</span>
                      </div>
                      <OddsBar odds={data.odds} homeCode={homeCode} awayCode={awayCode} />
                    </div>
                  )}

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Prediction
                    </div>
                    <p className="mt-1 font-medium">{data.prediction}</p>
                  </div>

                  {data.storylines.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Storylines
                      </div>
                      <ul className="mt-1 space-y-1">
                        {data.storylines.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-[var(--wc-accent)]">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400">AI-generated · verify before betting the house.</p>
                </>
              )}

              <button
                onClick={() => setOpen(false)}
                className="w-full rounded-md border border-slate-300 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OddsBar({
  odds,
  homeCode,
  awayCode,
}: {
  odds: { home: number; draw: number; away: number };
  homeCode: string;
  awayCode: string;
}) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <div className="bg-[var(--wc-accent)]" style={{ width: `${odds.home}%` }} />
        <div className="bg-slate-400" style={{ width: `${odds.draw}%` }} />
        <div className="bg-[var(--wc-accent-2)]" style={{ width: `${odds.away}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums">
        <span className="text-[var(--wc-accent)]">
          {flag(homeCode)} {odds.home}%
        </span>
        <span className="text-slate-400">Draw {odds.draw}%</span>
        <span className="text-[var(--wc-accent-2)]">
          {odds.away}% {flag(awayCode)}
        </span>
      </div>
    </div>
  );
}
