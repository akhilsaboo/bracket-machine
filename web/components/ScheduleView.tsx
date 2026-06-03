"use client";

import { SCHEDULE, type Fixture } from "@/lib/data";
import { hasSchedule, isLocked, splitSchedule, timeLabel } from "@/lib/schedule";
import { useTournament } from "@/lib/liveResults";
import { usePredictions } from "@/lib/predictions";
import { MatchRow } from "./MatchRow";

function MatchLine({
  f,
  now,
  locked,
}: {
  f: Fixture;
  now: Date;
  locked: boolean;
}) {
  const { groupResultFor } = useTournament(now, false);
  const result = groupResultFor(f);
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
      <div className="w-16 shrink-0 text-right">
        <div className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {timeLabel(f) || "—"}
        </div>
        {f.city && <div className="truncate text-[9px] text-slate-400">{f.city}</div>}
      </div>
      <div className="flex-1">
        <MatchRow fixture={f} showGroup locked={locked} result={result} />
      </div>
    </div>
  );
}

export function ScheduleView() {
  const { now } = usePredictions();
  const dated = hasSchedule(SCHEDULE);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <p className="text-xs text-slate-400">
        Every match in kickoff order — change a score right up until that game starts, and your edits
        flow straight into the standings and your bracket. Each pick locks once its match begins.
      </p>

      {!dated ? <FallbackByMatchday /> : <DatedSchedule now={now} />}
    </div>
  );
}

function DatedSchedule({ now }: { now: Date }) {
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
              <MatchLine key={f.id} f={f} now={now} locked={isLocked(f, now)} />
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
              <MatchLine key={f.id} f={f} now={now} locked />
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
