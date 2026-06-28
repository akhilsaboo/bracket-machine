"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FUTURES, fetchFuture, fetchGameOdds, type GameOdds, type KalshiMarketData } from "@/lib/kalshi";
import { flag, flagFromIso2 } from "@/lib/flags";
import { isKoMatchStarted, tournamentHasStarted } from "@/lib/results";
import { useTournament } from "@/lib/liveResults";
import { resolveKnockoutFrom, type KnockoutWinners, type KOMatch } from "@/lib/knockout";
import { usePredictions } from "@/lib/predictions";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  loadMyPicks,
  saveMyPick,
  deleteMyPick,
  pointsFor,
  type StoredPick,
  type PicksByMarket,
} from "@/lib/predictionPicks";

const PICKS_KEY = "wc2026-prediction-picks";

type Pick = StoredPick;
type Picks = PicksByMarket; // by future key

function loadLocalPicks(): Picks {
  try {
    return JSON.parse(localStorage.getItem(PICKS_KEY) ?? "{}") as Picks;
  } catch {
    return {};
  }
}
function saveLocalPicks(p: Picks) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

type SetPick = (marketKey: string, pick: Pick | null) => void;

// Shared picks store for both sub-tabs: localStorage for guests, Supabase
// (cross-device + pool leaderboard) once signed in, merging on sign-in.
function usePredictionPicks(): { picks: Picks; setPick: SetPick; userId: string | null } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [picks, setPicks] = useState<Picks>({});
  const syncedRef = useRef(false);

  useEffect(() => setPicks(loadLocalPicks()), []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !userId) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;
    let cancelled = false;
    (async () => {
      const server = await loadMyPicks(sb, userId);
      if (cancelled) return;
      const local = loadLocalPicks();
      const localOnly = Object.keys(local).filter((k) => !(k in server));
      const merged: Picks = { ...local, ...server };
      setPicks(merged);
      saveLocalPicks(merged);
      for (const k of localOnly) await saveMyPick(sb, userId, k, local[k]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setPick: SetPick = (marketKey, pick) => {
    // Futures cards carry no points (derive from odds); Games carry fixed points.
    const withPoints = pick ? { ...pick, points: pick.points ?? pointsFor(pick.prob) } : null;
    setPicks((prev) => {
      const next = { ...prev };
      if (withPoints) next[marketKey] = withPoints;
      else delete next[marketKey];
      saveLocalPicks(next);
      return next;
    });
    const sb = getSupabaseBrowser();
    if (sb && userId) {
      if (withPoints) void saveMyPick(sb, userId, marketKey, withPoints);
      else void deleteMyPick(sb, userId, marketKey);
    }
  };

  return { picks, setPick, userId };
}

export function PredictionsView() {
  const { now } = usePredictions();
  const [tab, setTab] = useState<"futures" | "games">("futures");
  const started = tournamentHasStarted(now);
  const { picks, setPick, userId } = usePredictionPicks();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-extrabold">Predictions</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {tab === "futures"
            ? `Predict the tournament's biggest questions. The % next to each option is its market-implied chance from Kalshi, and the points show what a correct pick is worth — the less likely your pick, the more it pays.${started ? " Odds are locked for the tournament." : ""}`
            : "Call every knockout match. Pick the winner of each tie as the bracket fills in; correct calls are worth more the deeper the round. Picks lock once a match is played."}
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
        <FuturesTab picks={picks} setPick={setPick} userId={userId} started={started} />
      ) : (
        <GamesTab picks={picks} setPick={setPick} userId={userId} />
      )}
    </div>
  );
}

function FuturesTab({
  picks,
  setPick,
  userId,
  started,
}: {
  picks: Picks;
  setPick: SetPick;
  userId: string | null;
  started: boolean;
}) {
  return (
    <div className="space-y-3">
      {started && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          🔒 Predictions are locked — the tournament has started.
        </div>
      )}
      {FUTURES.map((f) => (
        <FutureCard
          key={f.key}
          futureKey={f.key}
          pick={picks[f.key] ?? null}
          onPick={(p) => setPick(f.key, p)}
          locked={started}
        />
      ))}
      <p className="text-[11px] text-slate-400">
        {userId
          ? "Saved to your account — your picks sync across devices."
          : "Picks save on this device. Sign in to sync them across devices."}
      </p>
    </div>
  );
}

function FutureCard({
  futureKey,
  pick,
  onPick,
  locked,
}: {
  futureKey: string;
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
  locked: boolean;
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
          <div className="flex items-center gap-1.5">
            <span className="font-bold">{cfg.title}</span>
            {data?.frozen && (
              <span
                className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                title="Odds locked for the tournament"
              >
                🔒 locked
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{cfg.subtitle}</div>
        </div>
        {pick && !locked && (
          <button onClick={() => onPick(null)} className="text-[11px] text-slate-400 hover:text-red-600">
            clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-400">Loading odds…</p>
      ) : !data || data.outcomes.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No market data available yet.</p>
      ) : data.binary ? (
        <BinaryPicker data={data} pick={pick} onPick={onPick} locked={locked} />
      ) : (
        <>
          <div className="mt-3 space-y-1">
            {(showAll ? data.outcomes : data.outcomes.slice(0, 10)).map((o) => {
              const selected = pick?.ticker === o.ticker;
              return (
                <button
                  key={o.ticker}
                  disabled={locked}
                  onClick={() => onPick({ ticker: o.ticker, label: o.label, prob: o.prob, flagIso2: o.flagIso2 })}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                    selected
                      ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10 font-semibold"
                      : `border-slate-200 dark:border-slate-700 ${locked ? "" : "hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5"}`
                  } ${locked ? "cursor-default" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {o.flagIso2 && <span className="shrink-0 leading-none">{flagFromIso2(o.flagIso2)}</span>}
                    <span className="truncate">{o.label}</span>
                  </span>
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
          Your pick: {pick.flagIso2 ? `${flagFromIso2(pick.flagIso2)} ` : ""}
          <span className="font-semibold">{pick.label}</span>
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
  locked,
}: {
  data: KalshiMarketData;
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
  locked: boolean;
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
            disabled={locked}
            onClick={() => onPick({ ticker: o.ticker, label: o.label, prob: o.prob })}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              selected
                ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10"
                : `border-slate-200 dark:border-slate-700 ${locked ? "" : "hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5"}`
            } ${locked ? "cursor-default" : ""}`}
          >
            {o.label} <span className="tabular-nums text-slate-500">{o.prob == null ? "—" : `${o.prob}%`}</span>
            {pts(o.prob) != null && <span className="ml-1 text-[11px] text-[var(--wc-accent)]">· {pts(o.prob)} pts</span>}
          </button>
        );
      })}
    </div>
  );
}

// --- ⚔️ Games: per-knockout-match winner predictions -------------------------

// Knockout round label + base points (doubles each round, same scale as the
// bracket: R32 20 → R16 40 → QF 80 → SF/3rd 160 → Final 320).
function koMeta(no: number): { round: string; base: number } {
  if (no >= 73 && no <= 88) return { round: "Round of 32", base: 20 };
  if (no >= 89 && no <= 96) return { round: "Round of 16", base: 40 };
  if (no >= 97 && no <= 100) return { round: "Quarter-finals", base: 80 };
  if (no === 101 || no === 102) return { round: "Semi-finals", base: 160 };
  if (no === 103) return { round: "Third-place playoff", base: 160 };
  return { round: "Final", base: 320 };
}

// Points for a correct game pick: the round's base × a Kalshi odds weight, so
// bolder (underdog) calls in a round pay more. prob = market-implied % for the
// picked team — null until per-game markets open (same schedule as Futures), in
// which case it falls back to the flat base. Coin-flip (50%) = 1×; favorites pay
// less (floor 0.5×), underdogs more (cap 3×).
function gamePoints(no: number, prob: number | null | undefined): number {
  const { base } = koMeta(no);
  if (prob == null || prob <= 0) return base;
  const weight = Math.min(3, Math.max(0.5, 50 / prob));
  return Math.round(base * weight);
}
const KO_ORDER = [
  74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87, // R32
  89, 90, 93, 94, 91, 92, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104,
];

function GamesTab({ picks, setPick }: { picks: Picks; setPick: SetPick; userId: string | null }) {
  const { now, isPreview } = usePredictions();

  // Live "to advance" odds (KXWCADVANCE), keyed by team code. Drives point values.
  const [gameOdds, setGameOdds] = useState<GameOdds | null>(null);
  useEffect(() => {
    let on = true;
    fetchGameOdds().then((d) => on && setGameOdds(d));
    return () => {
      on = false;
    };
  }, []);

  // Real knockout state: R32 + real winners from the tournament truth (mock under
  // preview, real ESPN feed otherwise). Winners advance the tree so matchups
  // unlock as games are played.
  const { round32: r32, truth } = useTournament(now, isPreview);
  const realWinners: KnockoutWinners = useMemo(() => {
    const out: KnockoutWinners = {};
    for (const [k, v] of Object.entries(truth?.knockoutWinners ?? {})) out[k] = String(v);
    return out;
  }, [truth]);
  const resolved = useMemo(
    () => (r32 ? resolveKnockoutFrom(r32, realWinners) : null),
    [r32, realWinners],
  );

  if (!resolved) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        Knockout matchups appear here once the group stage finishes and the Round of 32 is set.
      </div>
    );
  }

  // Group determined matchups (both teams known) by round, in bracket order.
  const sections: { round: string; matches: number[] }[] = [];
  for (const no of KO_ORDER) {
    const m = resolved.get(no);
    if (!m || !m.home || !m.away) continue;
    const { round } = koMeta(no);
    const last = sections[sections.length - 1];
    if (last && last.round === round) last.matches.push(no);
    else sections.push({ round, matches: [no] });
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        No knockout matchups are set yet — check back as results come in.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <div
          key={s.round}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <header className="flex items-center justify-between bg-slate-50 px-4 py-2 dark:bg-slate-800/60">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{s.round}</h3>
            <span className="text-[10px] text-slate-400">{koMeta(s.matches[0]).base} pts base</span>
          </header>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {s.matches.map((no) => (
              <GameRow
                key={no}
                no={no}
                match={resolved.get(no)!}
                pick={picks[`game:${no}`] ?? null}
                onPick={(p) => setPick(`game:${no}`, p)}
                gameOdds={gameOdds}
                locked={isKoMatchStarted(no, now)}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-slate-400">
        Pick the winner of each tie. A match locks and grades once it's played. Correct picks earn the
        round's base points — doubling each round (R32 20 → Final 320) — weighted by the Kalshi market
        odds once per-game markets open, so bolder calls pay more.
      </p>
    </div>
  );
}

function GameRow({
  no,
  match,
  pick,
  onPick,
  gameOdds,
  locked,
}: {
  no: number;
  match: KOMatch;
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
  gameOdds: GameOdds | null;
  locked: boolean; // match has kicked off → picks frozen
}) {
  const { base } = koMeta(no);
  const winner = match.winner; // real result (null until played)
  const played = !!winner;
  const teams = [match.home!, match.away!];
  // Per-team "to advance" % from the live Kalshi market (null until that game's
  // market opens) → drives the point value (underdogs pay more).
  const teamProb = (t: KOMatch["home"]): number | null =>
    (t && gameOdds?.odds[t.code]) ?? null;
  const earned = pick?.points ?? base;
  // Don't allow a pick until this game's odds are posted — otherwise a heavy
  // favorite would lock the flat round base (e.g. 20 pts for Spain), which is
  // worth far more than its odds-weighted value. Two teams' markets open together.
  const oddsLoaded = !!gameOdds;
  const hasOdds = teamProb(match.home) != null || teamProb(match.away) != null;
  const pickDisabled = locked || played || !hasOdds;

  return (
    <div className="px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        {teams.map((t) => {
          const selected = pick?.ticker === t.code;
          const isWinner = played && winner!.code === t.code;
          const showResult = played && selected;
          const prob = teamProb(t);
          return (
            <button
              key={t.code}
              disabled={pickDisabled}
              onClick={() => onPick(selected ? null : { ticker: t.code, label: t.name, prob, points: gamePoints(no, prob) })}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                isWinner
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                  : selected
                    ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10 font-semibold"
                    : "border-slate-200 dark:border-slate-700"
              } ${pickDisabled ? "cursor-default" : "hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5"} ${
                pickDisabled && !played && !selected ? "opacity-60" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 leading-none">{flag(t.code)}</span>
                <span className="truncate">{t.name}</span>
              </span>
              {showResult ? (
                <span className="shrink-0 text-xs font-bold">
                  {isWinner ? (
                    <span className="text-emerald-600 dark:text-emerald-400">✓ +{earned}</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                </span>
              ) : (
                !played &&
                !locked &&
                hasOdds && (
                  <span className="shrink-0 text-right text-[11px] leading-tight">
                    <span className="block tabular-nums text-slate-400">{prob == null ? "—" : `${prob}%`}</span>
                    <span className="block font-bold tabular-nums text-[var(--wc-accent)]">
                      {gamePoints(no, prob)} pts
                    </span>
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
      {played && !pick && (
        <p className="mt-1 text-center text-[11px] text-slate-400">
          No pick · winner: {flag(winner!.code)} {winner!.name}
        </p>
      )}
      {locked && !played && (
        <p className="mt-1 text-right text-[10px] text-slate-400">🔒 kicked off — pick locked</p>
      )}
      {!played && !locked && (
        <p className="mt-1 text-right text-[10px] text-slate-400">
          {!oddsLoaded
            ? "loading odds…"
            : hasOdds
              ? gameOdds?.frozen[match.home!.code] || gameOdds?.frozen[match.away!.code]
                ? "🔒 odds locked"
                : "live odds · pays more for the underdog"
              : "⏳ odds not posted yet — pick opens when they do"}
        </p>
      )}
    </div>
  );
}
