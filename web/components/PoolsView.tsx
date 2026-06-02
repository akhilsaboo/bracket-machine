"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePredictions, type BracketSummary } from "@/lib/predictions";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SCHEDULE, type Fixture } from "@/lib/data";
import {
  buildMockTournament,
  isKnockoutStarted,
  mockGroupResult,
  tournamentHasStarted,
  type TournamentTruth,
} from "@/lib/results";
import { scoreEverything } from "@/lib/scoring";
import { upsertBracket } from "@/lib/brackets";
import { MemberBracketView } from "./MemberBracketView";
import {
  createPool,
  deletePool,
  getBracketsByIds,
  getMemberBrackets,
  getPoolMembers,
  joinPoolByCode,
  listMyPools,
  leavePool,
  setPoolBracket,
  type MemberBracket,
  type Pool,
  type PoolMember,
} from "@/lib/pools";

export function PoolsView() {
  const { user, requestSignIn } = useAuth();

  if (!isSupabaseConfigured()) {
    return (
      <Empty title="Pools need the backend">
        Backend isn't configured in this environment, so pools can't be loaded.
      </Empty>
    );
  }

  if (!user) {
    return (
      <Empty title="Sign in to create or join a pool">
        Pools let you and your friends compete on the same set of predictions. Sign in
        first, then come back here.
        <div className="mt-4">
          <button
            onClick={requestSignIn}
            className="rounded-full bg-[var(--wc-accent)] px-5 py-2 text-sm font-bold text-white shadow"
          >
            Sign in
          </button>
        </div>
      </Empty>
    );
  }

  return <PoolsAuthed userId={user.id} />;
}

function PoolsAuthed({ userId }: { userId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setLoading(true);
    listMyPools(sb).then((p) => {
      setPools(p);
      setLoading(false);
    });
  }, [refreshKey]);

  if (selectedId) {
    const pool = pools.find((p) => p.id === selectedId);
    if (!pool) {
      setSelectedId(null);
      return null;
    }
    return (
      <PoolDetail
        pool={pool}
        currentUserId={userId}
        onBack={() => {
          setSelectedId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">My pools</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : pools.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No pools yet. Create one or join with an invite code.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {pools.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs text-slate-500">
                    {p.member_count ?? 0} member{p.member_count === 1 ? "" : "s"} · {p.invite_code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CreatePoolForm
          userId={userId}
          onCreated={(id) => {
            refresh();
            setSelectedId(id);
          }}
        />
        <JoinPoolForm
          onJoined={(id) => {
            refresh();
            setSelectedId(id);
          }}
        />
      </div>
    </div>
  );
}

function CreatePoolForm({ userId, onCreated }: { userId: string; onCreated: (poolId: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || !name.trim()) return;
    setBusy(true);
    setError(null);
    // No auto-attach — the user picks their entry bracket once inside the pool.
    const p = await createPool(sb, name, userId, null);
    setBusy(false);
    if (!p) {
      setError("Couldn't create the pool. Try again.");
      return;
    }
    setName("");
    onCreated(p.id);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Create a pool</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. The Boys 2026"
        maxLength={60}
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--wc-accent)] dark:border-slate-700 dark:bg-slate-800"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-[11px] text-slate-400">You'll choose which bracket to enter next.</p>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="mt-3 w-full rounded-md bg-[var(--wc-accent)] py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create pool"}
      </button>
    </form>
  );
}

function JoinPoolForm({ onJoined }: { onJoined: (poolId: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || !code.trim()) return;
    setBusy(true);
    setError(null);
    // No auto-attach — entry is chosen inside the pool.
    const res = await joinPoolByCode(sb, code, null);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setCode("");
    onJoined(res.pool_id);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Join a pool</h3>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Invite code (e.g. ABC123)"
        maxLength={10}
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-bold uppercase tracking-widest outline-none focus:border-[var(--wc-accent)] dark:border-slate-700 dark:bg-slate-800"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="mt-3 w-full rounded-md bg-slate-700 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-slate-600"
      >
        {busy ? "Joining…" : "Join"}
      </button>
    </form>
  );
}

interface LeaderboardRow {
  user_id: string;
  display_name: string;
  isYou: boolean;
  totalPoints: number;
  groupPoints: number;
  koPoints: number;
  exact: number;
  tiebreaker_total_goals: number | null;
}

function PoolDetail({
  pool,
  currentUserId,
  onBack,
}: {
  pool: Pool;
  currentUserId: string;
  onBack: () => void;
}) {
  const { now, isPreview, brackets: myBrackets, createBracket, allRecords } = usePredictions();
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [brackets, setBrackets] = useState<MemberBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const canViewBrackets = isKnockoutStarted(now);

  // My attributed bracket id in THIS pool (null until set).
  const myEntryId = members.find((m) => m.user_id === currentUserId)?.bracket_id ?? null;
  // Entries lock once the first match kicks off (ESPN-style).
  const locked = tournamentHasStarted(now);
  const myEntry = myBrackets.find((b) => b.id === myEntryId) ?? null;
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setLoading(true);
    (async () => {
      const ms = await getPoolMembers(sb, pool.id);
      setMembers(ms);
      // Resolve each member's bracket: the one attributed to this pool, else
      // (legacy / not-yet-chosen) their earliest bracket as a fallback.
      const attributedIds = ms.map((m) => m.bracket_id).filter((x): x is string => !!x);
      const fallbackUserIds = ms.filter((m) => !m.bracket_id).map((m) => m.user_id);
      const [attributed, fallback] = await Promise.all([
        getBracketsByIds(sb, attributedIds),
        getMemberBrackets(sb, fallbackUserIds),
      ]);
      const byBracketId = new Map(attributed.map((b) => [b.id, b]));
      const byUserFallback = new Map(fallback.map((b) => [b.user_id, b]));
      const resolved = ms
        .map((m) => (m.bracket_id ? byBracketId.get(m.bracket_id) : byUserFallback.get(m.user_id)))
        .filter((b): b is MemberBracket => !!b);
      setBrackets(resolved);
      setLoading(false);
    })();
  }, [pool.id, reloadKey]);

  const changeEntry = async (bracketId: string) => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    // Ensure the bracket exists server-side before linking it (a freshly created
    // bracket may not have synced yet → FK error otherwise).
    const rec = allRecords().find((r) => r.id === bracketId);
    if (rec) await upsertBracket(sb, currentUserId, rec);
    await setPoolBracket(sb, pool.id, currentUserId, bracketId);
    setChooserOpen(false);
    setReloadKey((k) => k + 1);
  };

  // Brand-new (or just-joined) members have no entry yet — prompt to pick one,
  // unless entries are already locked.
  useEffect(() => {
    if (!loading && !myEntryId && !locked) setChooserOpen(true);
  }, [loading, myEntryId, locked]);

  // Single tournament truth (mock in preview, future: live from API).
  const truth: TournamentTruth | null = useMemo(
    () => (isPreview ? buildMockTournament(now) : null),
    [isPreview, now],
  );

  // Build the leaderboard: score each member's bracket against the same truth.
  const leaderboard: LeaderboardRow[] = useMemo(() => {
    const groupFixtures: Fixture[] = SCHEDULE;
    const resultFor = (f: Fixture) => (isPreview ? mockGroupResult(f, now) : null);
    const byUser = new Map(brackets.map((b) => [b.user_id, b]));
    const rows: LeaderboardRow[] = members.map((m) => {
      const b = byUser.get(m.user_id);
      const score = b
        ? scoreEverything(b.predictions, b.knockout, groupFixtures, resultFor, truth)
        : null;
      return {
        user_id: m.user_id,
        display_name: m.display_name ?? "Anonymous",
        isYou: m.user_id === currentUserId,
        totalPoints: score?.total ?? 0,
        groupPoints: score?.group.points ?? 0,
        koPoints: score?.ko.points ?? 0,
        exact: score?.group.exact ?? 0,
        tiebreaker_total_goals: b?.tiebreaker_total_goals ?? null,
      };
    });
    rows.sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.koPoints - a.koPoints ||
        b.exact - a.exact ||
        a.display_name.localeCompare(b.display_name),
    );
    return rows;
  }, [members, brackets, isPreview, now, truth, currentUserId]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(pool.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/?join=${pool.invite_code}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {}
  };

  const isOwner = pool.owner_id === currentUserId;

  // If a leaderboard row was clicked, swap to that member's read-only bracket.
  if (viewingMemberId) {
    const m = members.find((x) => x.user_id === viewingMemberId);
    const b = brackets.find((x) => x.user_id === viewingMemberId);
    if (!m || !b) {
      setViewingMemberId(null);
    } else {
      return (
        <MemberBracketView
          name={m.display_name ?? "Anonymous"}
          predictions={b.predictions}
          knockout={b.knockout}
          truth={truth}
          tiebreakerGoals={b.tiebreaker_total_goals}
          onBack={() => setViewingMemberId(null)}
        />
      );
    }
  }

  const onLeave = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    if (!confirm(`Leave "${pool.name}"? You can re-join with the invite code anytime.`)) return;
    await leavePool(sb, pool.id, currentUserId);
    onBack();
  };

  const onDelete = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    if (
      !confirm(
        `Delete "${pool.name}"? This removes the pool for everyone. Members keep their brackets but lose access to this leaderboard.`,
      )
    )
      return;
    await deletePool(sb, pool.id);
    onBack();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-[var(--wc-accent)]">
        ← All pools
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{pool.name}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              title="Copy a shareable join link"
              className="rounded-md bg-[var(--wc-accent)] px-3 py-1.5 text-sm font-bold text-white hover:opacity-90"
            >
              {linkCopied ? "Link copied!" : "Copy invite link"}
            </button>
            <button
              onClick={copyInvite}
              title="Copy just the code"
              className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-bold tracking-widest text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {copied ? "Copied!" : pool.invite_code}
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Send the link to a friend — clicking it opens the join prompt (sign-in required).
          Or share just the code if you'd rather they paste it manually.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Your entry</div>
          <p className="text-xs text-slate-500">
            {locked
              ? "🔒 Entries are locked — the tournament has started."
              : "The bracket you're competing with. Lockable change until the first match (Jun 11)."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="max-w-[12rem] truncate text-sm font-medium">
            {myEntry ? (
              <>
                {myEntry.kind === "second_chance" ? "🔄 " : ""}
                {myEntry.name}
              </>
            ) : (
              <span className="text-slate-400">No entry yet</span>
            )}
          </span>
          {!locked && (
            <button
              onClick={() => setChooserOpen(true)}
              className="rounded-md border border-[var(--wc-accent)]/40 px-3 py-1.5 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/10"
            >
              {myEntry ? "Change" : "Choose entry"}
            </button>
          )}
        </div>
      </div>

      {chooserOpen && !locked && (
        <ChooseEntryModal
          brackets={myBrackets}
          currentId={myEntryId}
          onPick={changeEntry}
          onCreate={() => {
            const id = createBracket();
            if (id) void changeEntry(id);
          }}
          onClose={() => setChooserOpen(false)}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          <span>Leaderboard</span>
          <span className="text-[10px] font-normal text-slate-400">
            {canViewBrackets
              ? "Tap a name to see their bracket"
              : "🔒 Brackets unlock once the knockout begins (Jun 28)"}
          </span>
        </header>
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
        ) : leaderboard.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">No members yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="w-8 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Member</th>
                <th className="w-16 px-3 py-2 text-right">Pts</th>
                <th className="hidden w-14 px-3 py-2 text-right sm:table-cell" title="Group-stage points">Grp</th>
                <th className="hidden w-14 px-3 py-2 text-right sm:table-cell" title="Knockout points">KO</th>
                <th className="w-12 px-3 py-2 text-right" title="Exact-score predictions">★</th>
                <th className="hidden w-20 px-3 py-2 text-right sm:table-cell" title="Tiebreaker: total goals">TB goals</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r, i) => {
                const clickable = canViewBrackets;
                return (
                  <tr
                    key={r.user_id}
                    onClick={clickable ? () => setViewingMemberId(r.user_id) : undefined}
                    className={`border-t border-slate-100 dark:border-slate-800 ${r.isYou ? "bg-[var(--wc-accent)]/5 font-semibold" : ""} ${clickable ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/40" : ""}`}
                  >
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      {r.display_name} {r.isYou && <span className="ml-1 text-[10px] text-[var(--wc-accent)]">YOU</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.totalPoints}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.groupPoints}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.koPoints}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {r.exact || ""}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                      {r.tiebreaker_total_goals ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <footer className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
          <strong>Scoring:</strong>{" "}
          group exact <span className="font-bold text-emerald-600 dark:text-emerald-400">★ +10</span>,
          correct outcome <span className="font-bold text-amber-600 dark:text-amber-400">✓ +5</span>.
          Knockout per correct match: R32 +20, R16 +40, QF +80, SF +160, 3rd-place +160, Champion +320.
          Ties broken by KO points, then exact-score count, then tiebreaker total-goals.
        </footer>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {isOwner ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Delete pool</div>
              <p className="text-xs text-slate-500">
                Removes the pool for everyone. Members keep their brackets.
              </p>
            </div>
            <button
              onClick={onDelete}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Delete pool
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Leave pool</div>
              <p className="text-xs text-slate-500">
                You can re-join later with the invite code or link.
              </p>
            </div>
            <button
              onClick={onLeave}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Leave pool
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChooseEntryModal({
  brackets,
  currentId,
  onPick,
  onCreate,
  onClose,
}: {
  brackets: BracketSummary[];
  currentId: string | null;
  onPick: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="brand-gradient px-5 py-4 text-white">
          <div className="text-lg font-extrabold">Choose your entry</div>
          <p className="text-xs text-white/80">
            Which bracket competes in this pool? You can change it until the first match.
          </p>
        </div>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto p-3">
          {brackets.map((b) => (
            <button
              key={b.id}
              onClick={() => onPick(b.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                b.id === currentId
                  ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10"
                  : "border-slate-200 hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
              }`}
            >
              <span className="truncate font-medium">
                {b.kind === "second_chance" ? "🔄 " : ""}
                {b.name}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{b.predicted}/72</span>
            </button>
          ))}
          <button
            onClick={onCreate}
            className="mt-1 flex w-full items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
          >
            ＋ Create a new bracket &amp; enter it
          </button>
        </div>
      </div>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{children}</div>
    </div>
  );
}
