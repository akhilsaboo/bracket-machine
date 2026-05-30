"use client";

import { groupFixtures } from "@/lib/data";
import { groupProgress, groupStandings } from "@/lib/compute";
import { isLocked, isOver } from "@/lib/schedule";
import { mockGroupResult } from "@/lib/results";
import { usePredictions } from "@/lib/predictions";
import { MatchRow } from "./MatchRow";
import { StandingsTable } from "./StandingsTable";

export function GroupCard({ group }: { group: string }) {
  const { predictions, now, isPreview } = usePredictions();
  const fixtures = groupFixtures(group);
  const standings = groupStandings(group, predictions);
  const [done, total] = groupProgress(group, predictions);

  const upcoming = fixtures.filter((f) => !isOver(f, now));
  const over = fixtures.filter((f) => isOver(f, now));

  // Mock results during preview demo; future: real results from a live API.
  const resultFor = (id: string) => {
    if (!isPreview) return null;
    const f = fixtures.find((x) => x.id === id);
    return f ? mockGroupResult(f, now) : null;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between rounded-t-xl bg-[var(--wc-accent)] px-4 py-2 text-white">
        <h3 className="text-sm font-bold tracking-wide">Group {group}</h3>
        <span className="text-[11px] font-medium opacity-90">
          {done}/{total} predicted
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
