"use client";

import { useEffect, useState } from "react";
import { FUTURES, fetchFuture, type KalshiMarketData } from "@/lib/kalshi";
import { isKnockoutStarted } from "@/lib/results";
import { usePredictions } from "@/lib/predictions";

const PICKS_KEY = "wc2026-prediction-picks";

interface Pick {
  ticker: string; // outcome market ticker (or "<series>-NO" for a binary No)
  label: string;
  prob: number | null; // implied % locked at pick time
}
type Picks = Record<string, Pick>; // by future key

function loadPicks(): Picks {
  try {
    return JSON.parse(localStorage.getItem(PICKS_KEY) ?? "{}") as Picks;
  } catch {
    return {};
  }
}

export function PredictionsView() {
  const { now } = usePredictions();
  const [tab, setTab] = useState<"futures" | "games">("futures");
  const gamesOpen = isKnockoutStarted(now);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-extrabold">Predictions</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Call the tournament's big questions. Odds + the points each pick is worth come from Kalshi
          and lock ~2 days before kickoff — bolder correct calls earn more. (Leaderboard coming soon.)
        </p>
        <div className="mt-3 flex gap-1">
          {(["futures", "games"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                tab === t
                  ? "bg-[var(--wc-accent)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t === "futures" ? "🔮 Futures" : "⚔️ Games"}
            </button>
          ))}
        </div>
      </div>

      {tab === "futures" ? (
        <FuturesTab />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          {gamesOpen
            ? "Per-game predictions are coming soon."
            : "⚔️ Game-by-game predictions unlock when the knockout rounds begin (Jun 28)."}
        </div>
      )}
    </div>
  );
}

function FuturesTab() {
  const [picks, setPicks] = useState<Picks>({});
  useEffect(() => setPicks(loadPicks()), []);

  const setPick = (futureKey: string, pick: Pick | null) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (pick) next[futureKey] = pick;
      else delete next[futureKey];
      try {
        localStorage.setItem(PICKS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {FUTURES.map((f) => (
        <FutureCard key={f.key} futureKey={f.key} pick={picks[f.key] ?? null} onPick={(p) => setPick(f.key, p)} />
      ))}
      <p className="text-[11px] text-slate-400">
        Picks save on this device for now. Odds may read “—” until betting markets fill in closer to
        kickoff.
      </p>
    </div>
  );
}

function FutureCard({
  futureKey,
  pick,
  onPick,
}: {
  futureKey: string;
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
}) {
  const cfg = FUTURES.find((f) => f.key === futureKey)!;
  const [data, setData] = useState<KalshiMarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFuture(futureKey).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [futureKey]);

  const pct = (p: number | null) => (p == null ? "—" : `${p}%`);
  const pts = (p: number | null) => (p == null || p <= 0 ? null : Math.min(100, Math.round(10 / (p / 100))));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{cfg.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{cfg.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{cfg.subtitle}</div>
        </div>
        {pick && (
          <button onClick={() => onPick(null)} className="text-[11px] text-slate-400 hover:text-red-600">
            clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-400">Loading odds…</p>
      ) : !data || data.outcomes.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No market data yet — check back closer to the tournament.</p>
      ) : data.binary ? (
        <BinaryPicker data={data} pick={pick} onPick={onPick} />
      ) : (
        <>
          <div className="mt-3 space-y-1">
            {(showAll ? data.outcomes : data.outcomes.slice(0, 10)).map((o) => {
              const selected = pick?.ticker === o.ticker;
              return (
                <button
                  key={o.ticker}
                  onClick={() => onPick({ ticker: o.ticker, label: o.label, prob: o.prob })}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                    selected
                      ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10 font-semibold"
                      : "border-slate-200 hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-slate-500">{pct(o.prob)}</span>
                    {pts(o.prob) != null && (
                      <span className="rounded bg-[var(--wc-accent)]/10 px-1.5 text-[11px] font-semibold text-[var(--wc-accent)]">
                        {pts(o.prob)} pts
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {data.outcomes.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-semibold text-[var(--wc-accent)]"
            >
              {showAll ? "Show top 10" : `Show all ${data.outcomes.length} →`}
            </button>
          )}
        </>
      )}

      {pick && (
        <p className="mt-2 text-[11px] text-[var(--wc-accent)]">
          Your pick: <span className="font-semibold">{pick.label}</span>
          {pick.prob != null && ` · locked at ${pick.prob}%`}
        </p>
      )}
    </div>
  );
}

function BinaryPicker({
  data,
  pick,
  onPick,
}: {
  data: KalshiMarketData;
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
}) {
  const yes = data.outcomes[0];
  const yesProb = yes?.prob ?? null;
  const noProb = yesProb == null ? null : 100 - yesProb;
  const pts = (p: number | null) => (p == null || p <= 0 ? null : Math.min(100, Math.round(10 / (p / 100))));
  const opts = [
    { ticker: yes?.ticker ?? `${data.series}-Y`, label: "Yes", prob: yesProb },
    { ticker: `${data.series}-NO`, label: "No", prob: noProb },
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const selected = pick?.ticker === o.ticker;
        return (
          <button
            key={o.ticker}
            onClick={() => onPick({ ticker: o.ticker, label: o.label, prob: o.prob })}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              selected
                ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10"
                : "border-slate-200 hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
            }`}
          >
            {o.label} <span className="tabular-nums text-slate-500">{o.prob == null ? "—" : `${o.prob}%`}</span>
            {pts(o.prob) != null && <span className="ml-1 text-[11px] text-[var(--wc-accent)]">· {pts(o.prob)} pts</span>}
          </button>
        );
      })}
    </div>
  );
}
