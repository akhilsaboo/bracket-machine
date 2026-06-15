"use client";

// Overall (all-users) leaderboard. Reads the precomputed snapshot from
// /api/leaderboard — the heavy scoring happens server-side and is cached, so this
// just renders a small ranked list. Highlights the signed-in user if they're in it.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { percentileOf } from "@/lib/leaderboard";

interface Row {
  rank: number;
  user_id: string;
  bracket_id: string;
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

export function GlobalLeaderboard({
  onViewBracket,
}: {
  /** Open a read-only view of someone's bracket (locked picks only). */
  onViewBracket?: (b: { bracketId: string; name: string; bracketName: string }) => void;
} = {}) {
  const { user } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Refs to each of MY entry rows, keyed by bracket_id. A Map preserves insertion
  // (= rank) order, so "Jump to me" can step through my brackets best→worst.
  const myRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [jumpIdx, setJumpIdx] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Cycle through my brackets in rank order, ESPN "My Brackets" style — each click
  // scrolls to the next one and flashes it.
  const jumpToMe = () => {
    const ids = [...myRefs.current.keys()];
    if (ids.length === 0) return;
    const i = jumpIdx % ids.length;
    const id = ids[i];
    myRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1300);
    setJumpIdx(i + 1);
  };

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
          {/* Fixed-height scroll pane so the page doesn't grow with the field. */}
          <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Entry</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Group</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">KO</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th
                    className="px-3 py-2 text-right"
                    title="Percentile — the share of all brackets worldwide your score beats (ESPN-style). The leader tops out at 99%; nobody hits a perfect 100%."
                  >
                    PCTL
                  </th>
                  <th className="w-6 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {snap.rows.map((r) => {
                  const you = !!user && r.user_id === user.id;
                  const open = () =>
                    onViewBracket?.({ bracketId: r.bracket_id, name: r.display_name, bracketName: r.bracket_name });
                  return (
                    <tr
                      key={r.bracket_id}
                      ref={(el) => {
                        if (!you) return;
                        if (el) myRefs.current.set(r.bracket_id, el);
                        else myRefs.current.delete(r.bracket_id);
                      }}
                      onClick={onViewBracket ? open : undefined}
                      className={`border-t border-slate-100 transition-colors dark:border-slate-800 ${
                        you ? "bg-[var(--wc-accent,#7c3aed)]/10 font-semibold" : ""
                      } ${
                        flashId === r.bracket_id ? "ring-2 ring-inset ring-[var(--wc-accent,#7c3aed)]" : ""
                      } ${onViewBracket ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50" : ""}`}
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
                      <td className="hidden px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.group}</td>
                      <td className="hidden px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.ko}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{r.points}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--wc-accent,#7c3aed)]">
                        {snap.scores?.length ? `${percentileOf(snap.scores, r.points)}%` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-300 dark:text-slate-600">
                        {onViewBracket ? "›" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800/40">
            <span>
              {snap.rows.length < snap.totalEntries
                ? `Showing top ${snap.rows.length} of ${snap.totalEntries}`
                : `${snap.totalEntries} ${snap.totalEntries === 1 ? "entry" : "entries"}`}
            </span>
            {(() => {
              const mine = user ? snap.rows.filter((r) => r.user_id === user.id).length : 0;
              if (mine === 0) return null;
              return (
                <button onClick={jumpToMe} className="font-semibold text-[var(--wc-accent,#7c3aed)] hover:underline">
                  ↧ {mine > 1 ? `Jump to my brackets (${(jumpIdx % mine) + 1}/${mine})` : "Jump to me"}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
