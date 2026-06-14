"use client";

// Overall (all-users) leaderboard. Reads the precomputed snapshot from
// /api/leaderboard — the heavy scoring happens server-side and is cached, so this
// just renders a small ranked list. Highlights the signed-in user if they're in it.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { percentileOf } from "@/lib/leaderboard";

interface Row {
  rank: number;
  user_id: string;
  display_name: string;
  bracket_name: string;
  points: number;
  group: number;
  ko: number;
  exact: number;
}
interface Snapshot {
  rows: Row[];
  totalEntries: number;
  hasResults: boolean;
  updatedAt: string;
  scores: number[];
}

export function GlobalLeaderboard() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetch("/api/leaderboard")
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(new Error(`Error ${r.status}`))))
      .then((d) => on && setSnap(d))
      .catch((e) => on && setError(e.message))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, []);

  if (loading) return <p className="py-12 text-center text-sm text-slate-400">Loading leaderboard…</p>;
  if (error) return <p className="py-12 text-center text-sm text-red-500">Couldn’t load the leaderboard.</p>;
  if (!snap) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">🌍 Global leaderboard</h2>
          <p className="text-xs text-slate-500">Every submitted bracket, ranked against the real results.</p>
        </div>
        {snap.hasResults && (
          <span className="text-[10px] text-slate-400">
            Updated {new Date(snap.updatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {!snap.hasResults ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            The tournament hasn’t kicked off yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Rankings appear here once real results start coming in.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Entry</th>
                <th className="px-3 py-2 text-right">Group</th>
                <th className="px-3 py-2 text-right">KO</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Percentile — the share of all brackets worldwide your score beats (ESPN-style). The leader tops out at 99%; nobody hits a perfect 100%."
                >
                  PCTL
                </th>
              </tr>
            </thead>
            <tbody>
              {snap.rows.map((r) => {
                const you = !!user && r.user_id === user.id;
                return (
                  <tr
                    key={`${r.rank}-${r.user_id}`}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      you ? "bg-[var(--wc-accent,#7c3aed)]/10 font-semibold" : ""
                    }`}
                  >
                    <td className="px-3 py-2 tabular-nums text-slate-500">{r.rank}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col leading-tight">
                        <span>
                          {r.display_name}
                          {you && <span className="ml-1 text-xs text-[var(--wc-accent,#7c3aed)]">(you)</span>}
                        </span>
                        <span className="text-xs text-slate-400">{r.bracket_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.group}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.ko}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{r.points}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--wc-accent,#7c3aed)]">
                      {snap.scores?.length ? `${percentileOf(snap.scores, r.points)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
