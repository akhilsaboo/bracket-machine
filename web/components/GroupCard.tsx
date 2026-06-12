"use client";

import { groupFixtures } from "@/lib/data";
import { groupPickProgress, groupStandings, withResults } from "@/lib/compute";
import { isLocked, isOver } from "@/lib/schedule";
import { useTournament } from "@/lib/liveResults";
import { usePredictions } from "@/lib/predictions";
import { MatchRow } from "./MatchRow";
import { StandingsTable } from "./StandingsTable";

export function GroupCard({ group }: { group: string }) {
  const { predictions, now, isPreview } = usePredictions();
  const { groupResultFor, liveResultFor, bracketResults } = useTournament(now, isPreview);
  const fixtures = groupFixtures(group);
  // Standings reflect real results (finished + in-progress) for matches the user
  // couldn't pick + their own picks for the rest, so the group resolves correctly.
  const effective = withResults(predictions, bracketResults);
  const standings = groupStandings(group, effective);
  const [done, total] = groupPickProgress(group, predictions, now);
  const hasLive = fixtures.some((f) => liveResultFor(f));

  const upcoming = fixtures.filter((f) => !isOver(f, now));
  const over = fixtures.filter((f) => isOver(f, now));

  // Real (or preview-mock) result for a fixture, for grading.
  const resultFor = (id: string) => {
    const f = fixtures.find((x) => x.id === id);
    return f ? groupResultFor(f) : null;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between rounded-t-xl bg-[var(--wc-accent)] px-4 py-2 text-white">
        <h3 className="text-sm font-bold tracking-wide">Group {group}</h3>
        <div className="flex items-center gap-2">
          {hasLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              Live
            </span>
          )}
          <span className="text-[11px] font-medium opacity-90">
            {done}/{total} picks
          </span>
        </div>
      </header>

      <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        {upcoming.map((f) => (
          <MatchRow
            key={f.id}
            fixture={f}
            locked={isLocked(f, now)}
            result={resultFor(f.id)}
            liveResult={liveResultFor(f)}
          />
        ))}
        {over.map((f) => (
          <MatchRow key={f.id} fixture={f} locked result={resultFor(f.id)} />
        ))}
      </div>

      <div className="px-3 py-2">
        <StandingsTable rows={standings} />
      </div>
    </section>
  );
}
