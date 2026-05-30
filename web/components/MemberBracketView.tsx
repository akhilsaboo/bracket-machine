"use client";

import { resolveKnockout } from "@/lib/knockout";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";
import type { KnockoutResult, TournamentTruth } from "@/lib/results";
import { BracketTree } from "./BracketTree";

export function MemberBracketView({
  name,
  predictions,
  knockout,
  truth,
  tiebreakerGoals,
  onBack,
}: {
  name: string;
  predictions: Predictions;
  knockout: KnockoutWinners;
  truth: TournamentTruth | null;
  tiebreakerGoals: number | null;
  onBack: () => void;
}) {
  const resolved = resolveKnockout(predictions, knockout);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-[var(--wc-accent)]">
          ← Back to leaderboard
        </button>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {name} hasn't finished predicting all 12 groups yet.
          </p>
        </div>
      </div>
    );
  }

  const getResult = truth
    ? (no: number): KnockoutResult | null => {
        const code = truth.knockoutWinners[no];
        return code ? { winnerCode: code } : null;
      }
    : undefined;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-[var(--wc-accent)]">
        ← Back to leaderboard
      </button>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-extrabold">{name}&rsquo;s bracket</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Read-only · group-stage picks hidden by design (those reveal as each kickoff passes).
          {tiebreakerGoals !== null && (
            <>
              {" "}
              · Tiebreaker: <span className="font-semibold">{tiebreakerGoals}</span> total goals predicted.
            </>
          )}
        </p>
      </div>
      <BracketTree resolved={resolved} getResult={getResult} />
    </div>
  );
}
