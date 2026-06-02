"use client";

import { SCHEDULE, type Fixture } from "@/lib/data";
import { hasSchedule, isLocked, splitSchedule, timeLabel } from "@/lib/schedule";
import { mockGroupResult, PREVIEW_NOW_ISO, tournamentHasStarted } from "@/lib/results";
import { usePredictions } from "@/lib/predictions";
import { MatchRow } from "./MatchRow";

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
  const result = isPreview ? mockGroupResult(f, now) : null;
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
  const { now, isPreview, setPreviewNow } = usePredictions();
  const dated = hasSchedule(SCHEDULE);
  // The preview toggle is only useful BEFORE the tournament starts — once real
  // matches are happening, real results from the live data source take over.
  const realNow = isPreview ? new Date() : now;
  const showPreviewToggle = dated && !tournamentHasStarted(realNow);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Adjust scores in chronological order — changes flow to your groups and bracket.
        </p>
        {showPreviewToggle && (
          <button
            onClick={() => setPreviewNow(isPreview ? null : PREVIEW_NOW_ISO)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              isPreview
                ? "bg-[var(--wc-accent)] text-white"
                : "border border-slate-300 text-slate-500 hover:border-[var(--wc-accent)] dark:border-slate-600"
            }`}
            title="Preview how completed matches lock, red out, and grade your picks"
          >
            {isPreview ? "Preview: mid-tournament ✕" : "Preview mid-tournament"}
          </button>
        )}
      </div>

      {!dated ? <FallbackByMatchday /> : <DatedSchedule now={now} isPreview={isPreview} />}
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
