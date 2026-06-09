"use client";

// Owner analytics dashboard. Not linked anywhere in the app — reach it at /admin
// and unlock with the ADMIN_SECRET (or CRON_SECRET). The secret is held only in
// sessionStorage and sent as a Bearer token to /api/admin/stats, which does the
// service-role aggregation server-side.
import { useCallback, useEffect, useState } from "react";

interface Stats {
  generatedAt: string;
  totals: {
    users: number;
    brackets: number;
    submittedBrackets: number;
    pools: number;
    memberships: number;
    picks: number;
    emailOptOuts: number;
  };
  funnel: { users: number; withBracket: number; withSubmitted: number; inPool: number; withPicks: number };
  personas: { label: string; count: number }[];
  champions: { label: string; count: number }[];
  winnerPicks: { label: string; count: number }[];
  topPools: { label: string; count: number }[];
  signups: { day: string; count: number }[];
}

const SECRET_KEY = "wc2026-admin-secret";

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function BarList({
  title,
  rows,
  empty = "No data yet",
}: {
  title: string;
  rows: { label: string; count: number }[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <div className="w-40 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title={r.label}>
                {r.label}
              </div>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded bg-[var(--wc-accent,#7c3aed)]"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {r.count}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Funnel({ funnel }: { funnel: Stats["funnel"] }) {
  const steps = [
    { label: "Signed up", value: funnel.users },
    { label: "Built a bracket", value: funnel.withBracket },
    { label: "Submitted it", value: funnel.withSubmitted },
    { label: "Joined a pool", value: funnel.inPool },
    { label: "Made futures picks", value: funnel.withPicks },
  ];
  const max = Math.max(1, funnel.users);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Participation funnel</h3>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-40 shrink-0 text-xs text-slate-600 dark:text-slate-300">{s.label}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded bg-emerald-500" style={{ width: `${(s.value / max) * 100}%` }} />
            </div>
            <div className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {s.value}
              <span className="ml-1 text-slate-400">
                {funnel.users ? `${Math.round((s.value / funnel.users) * 100)}%` : "0%"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Signups({ signups }: { signups: Stats["signups"] }) {
  const max = Math.max(1, ...signups.map((s) => s.count));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Signups — last 14 days</h3>
      <div className="flex h-24 items-end gap-1">
        {signups.map((s) => (
          <div key={s.day} className="flex flex-1 flex-col items-center gap-1" title={`${s.day}: ${s.count}`}>
            <div
              className="w-full rounded-t bg-[var(--wc-accent,#7c3aed)]"
              style={{ height: `${(s.count / max) * 100}%`, minHeight: s.count ? 2 : 0 }}
            />
            <div className="text-[9px] text-slate-400">{s.day.slice(8)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [secret, setSecret] = useState("");
  const [input, setInput] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", { headers: { authorization: `Bearer ${key}` } });
      if (res.status === 401) {
        setError("Wrong secret.");
        sessionStorage.removeItem(SECRET_KEY);
        setSecret("");
        return;
      }
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
        return;
      }
      setStats((await res.json()) as Stats);
      setSecret(key);
      sessionStorage.setItem(SECRET_KEY, key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(SECRET_KEY);
    if (saved) load(saved);
  }, [load]);

  if (!secret || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) load(input.trim());
          }}
          className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
        >
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Owner dashboard</h1>
          <p className="text-xs text-slate-500">Enter the admin secret to view analytics.</p>
          <input
            type="password"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ADMIN_SECRET"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--wc-accent,#7c3aed)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--wc-accent,#7c3aed)] py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  const t = stats.totals;
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Owner dashboard</h1>
          <button
            onClick={() => load(secret)}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-[var(--wc-accent,#7c3aed)] dark:border-slate-600"
          >
            ↻ Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Users" value={t.users} />
          <StatCard label="Brackets" value={t.brackets} sub={`${t.submittedBrackets} submitted`} />
          <StatCard label="Pools" value={t.pools} />
          <StatCard label="Memberships" value={t.memberships} />
          <StatCard label="Futures picks" value={t.picks} />
          <StatCard label="Email opt-outs" value={t.emailOptOuts} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Funnel funnel={stats.funnel} />
          <Signups signups={stats.signups} />
          <BarList title="🤖 AI persona used" rows={stats.personas} />
          <BarList title="🏆 Predicted champion" rows={stats.champions} />
          <BarList title="🎯 Futures: tournament winner picks" rows={stats.winnerPicks} />
          <BarList title="👥 Biggest pools" rows={stats.topPools} />
        </div>

        <p className="text-center text-[10px] text-slate-400">
          Generated {new Date(stats.generatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
