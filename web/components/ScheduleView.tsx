"use client";

import { SCHEDULE, type Fixture } from "@/lib/data";
import { hasSchedule, isLocked, splitSchedule, timeLabel } from "@/lib/schedule";
import { useTournament } from "@/lib/liveResults";
import { usePredictions } from "@/lib/predictions";
import { resolveKnockoutFrom, type KnockoutWinners } from "@/lib/knockout";
import { flag } from "@/lib/flags";
import { MatchRow } from "./MatchRow";
import koSchedule from "@/data/knockout_schedule.json";

function MatchLine({
  f,
  now,
  locked,
  isPreview,
}: {
  f: Fixture;
  now: Date;
  locked: boolean;
  isPreview: boolean;
}) {
  // Same live-score wiring as the Group tab: real final result for grading + the
  // in-progress score so live games show read-only here too.
  const { groupResultFor, liveResultFor } = useTournament(now, isPreview);
  const result = groupResultFor(f);
  const liveResult = liveResultFor(f);
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
      <div className="w-16 shrink-0 text-right">
        <div className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {timeLabel(f) || "—"}
        </div>
        {f.city && <div className="truncate text-[9px] text-slate-400">{f.city}</div>}
      </div>
      <div className="flex-1">
        <MatchRow fixture={f} showGroup locked={locked} result={result} liveResult={liveResult} />
      </div>
    </div>
  );
}

export function ScheduleView() {
  const { now, isPreview, activeKind } = usePredictions();
  const isSecondChance = activeKind === "second_chance";
  const dated = hasSchedule(SCHEDULE);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <p className="text-xs text-slate-400">
        Every match in kickoff order, in your local time. The knockout schedule is the real bracket —
        the same for everyone — and fills in with teams as each round is decided.
      </p>

      <KnockoutSchedule now={now} isPreview={isPreview} />

      {/* Group stage: your own predicted scorelines. Hidden on a knockout-only
          second-chance bracket, where the knockout schedule above is the whole story. */}
      {!isSecondChance &&
        (!dated ? <FallbackByMatchday /> : <DatedSchedule now={now} isPreview={isPreview} />)}
    </div>
  );
}

// ── Universal knockout schedule: the REAL fixtures (same for everyone) + kickoff
// times, filling in teams as each round resolves. Not the user's bracket path, so
// there's no per-person divergence. Shown on every bracket, incl. second-chance.
const KO_ROUND_LABEL: Record<string, string> = {
  R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final",
  SF: "Semi-final", third: "Third place", final: "Final",
};
interface KoEntry { no: number; stage: string; kickoffUTC: string; date: string; venue?: string; city?: string }

function KnockoutSchedule({ now, isPreview }: { now: Date; isPreview: boolean }) {
  const { round32: realR32, truth } = useTournament(now, isPreview);
  const winners: KnockoutWinners = {};
  for (const [k, v] of Object.entries(truth?.knockoutWinners ?? {})) winners[k] = String(v);
  const resolved = realR32 ? resolveKnockoutFrom(realR32, winners) : null;

  if (!resolved) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        🏆 The knockout schedule appears here once the group stage finishes and the Round of 32 is set.
      </div>
    );
  }

  const entries = (koSchedule as KoEntry[]).slice().sort((a, b) => Date.parse(a.kickoffUTC) - Date.parse(b.kickoffUTC));
  const days: { date: string; label: string; rows: KoEntry[] }[] = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.rows.push(e);
    else
      days.push({
        date: e.date,
        label: new Date(e.kickoffUTC).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        rows: [e],
      });
  }

  const Side = ({ t }: { t: { code: string; name: string } | null }) =>
    t ? (
      <span className="flex min-w-0 items-center gap-1">
        <span className="shrink-0 leading-none">{flag(t.code)}</span>
        <span className="truncate">{t.name}</span>
      </span>
    ) : (
      <span className="italic text-slate-400">TBD</span>
    );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">🏆 Knockout schedule</h3>
      {days.map((day) => (
        <section
          key={day.date}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <header className="flex items-center justify-between bg-slate-50 px-4 py-2 dark:bg-slate-800/60">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{day.label}</h4>
            <span className="text-[10px] text-slate-400">
              {day.rows.length} {day.rows.length === 1 ? "match" : "matches"}
            </span>
          </header>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {day.rows.map((e) => {
              const m = resolved.get(e.no);
              const time = new Date(e.kickoffUTC).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
              return (
                <div key={e.no} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="w-14 shrink-0 text-right">
                    <div className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{time}</div>
                    <div className="text-[9px] uppercase tracking-wide text-slate-400">
                      {KO_ROUND_LABEL[e.stage] ?? e.stage}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Side t={m?.home ?? null} />
                      <span className="shrink-0 text-slate-400">v</span>
                      <Side t={m?.away ?? null} />
                    </div>
                    {e.city && <div className="text-[10px] text-slate-400">{e.city}</div>}
                  </div>
                  {m?.winner && (
                    <span className="shrink-0 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ {m.winner.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function DatedSchedule({ now, isPreview }: { now: Date; isPreview: boolean }) {
  const { days, over } = splitSchedule(SCHEDULE, now);
  return (
    <>
      {days.map((day) => (
        <section
          key={day.key}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <header className="flex items-center justify-between bg-slate-50 px-4 py-2 dark:bg-slate-800/60">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{day.label}</h3>
            <span className="text-[10px] text-slate-400">{day.fixtures.length} matches</span>
          </header>
          <div className="px-3 py-1">
            {day.fixtures.map((f) => (
              <MatchLine key={f.id} f={f} now={now} locked={isLocked(f, now)} isPreview={isPreview} />
            ))}
          </div>
        </section>
      ))}

      {over.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/20">
          <header className="bg-red-100/60 px-4 py-2 text-sm font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Completed ({over.length})
          </header>
          <div className="px-3 py-1">
            {over.map((f) => (
              <MatchLine key={f.id} f={f} now={now} locked isPreview={isPreview} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function FallbackByMatchday() {
  return (
    <>
      {[1, 2, 3].map((md) => {
        const fixtures = SCHEDULE.filter((f) => f.matchday === md);
        return (
          <section
            key={md}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <header className="bg-[var(--wc-accent)] px-4 py-2 text-sm font-bold text-white">
              Matchday {md}
            </header>
            <div className="divide-y divide-slate-100 px-4 dark:divide-slate-800">
              {fixtures.map((f) => (
                <MatchRow key={f.id} fixture={f} showGroup />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
