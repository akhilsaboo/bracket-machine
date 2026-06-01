"use client";

import { TEAMS } from "@/lib/data";
import { flag } from "@/lib/flags";
import { usePredictions } from "@/lib/predictions";
import { tournamentHasStarted } from "@/lib/results";

const TEAMS_BY_NAME = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name));

const AWARDS = [
  { key: "golden_boot", title: "Golden Boot", subtitle: "Top scorer", icon: "⚽" },
  { key: "golden_glove", title: "Golden Glove", subtitle: "Best goalkeeper", icon: "🧤" },
  { key: "best_player", title: "Best Player", subtitle: "Golden Ball — outstanding player", icon: "🏅" },
  { key: "best_young_player", title: "Best Young Player", subtitle: "Best player under 21", icon: "✨" },
] as const;

export function PredictionsView() {
  const { awards, setAward, activeName, now } = usePredictions();
  const locked = tournamentHasStarted(now);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-extrabold">Tournament awards</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Call who takes home each individual prize. Saved with your active bracket
          (<span className="font-medium">{activeName}</span>).{" "}
          {locked ? "🔒 Locked — the tournament has started." : "Editable until the tournament kicks off."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AWARDS.map((a) => {
          const code = awards[a.key] ?? "";
          return (
            <div
              key={a.key}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{a.icon}</span>
                <div className="min-w-0">
                  <div className="font-bold">{a.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{a.subtitle}</div>
                </div>
                {code && <span className="ml-auto text-xl leading-none">{flag(code)}</span>}
              </div>
              <select
                value={code}
                disabled={locked}
                onChange={(e) => setAward(a.key, e.target.value || null)}
                className="mt-3 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--wc-accent)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
              >
                <option value="">Pick a team…</option>
                {TEAMS_BY_NAME.map((t) => (
                  <option key={t.code} value={t.code}>
                    {flag(t.code)} {t.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400">
        Player-level picks and award scoring are coming later — for now these are just your calls per bracket.
      </p>
    </div>
  );
}
