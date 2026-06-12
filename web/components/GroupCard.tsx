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
  const { groupResultFor, truth } = useTournament(now, isPreview);
  const fixtures = groupFixtures(group);
  // Standings reflect real results for already-played matches + the user's picks
  // for the rest, so a late joiner's group resolves correctly.
  const effective = withResults(predictions, truth?.groupResults ?? {});
  const standings = groupStandings(group, effective);
  const [done, total] = groupPickProgress(group, predictions, now);

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
        <span className="text-[11px] font-medium opacity-90">
          {done}/{total} picks
        </span>
      </header>

      <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        {upcoming.map((f) => (
          <MatchRow key={f.id} fixture={f} locked={isLocked(f, now)} result={resultFor(f.id)} />
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
