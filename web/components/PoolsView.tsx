"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePredictions, type BracketRecord, type BracketSummary } from "@/lib/predictions";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SCHEDULE, type Fixture } from "@/lib/data";
import { isKnockoutStarted } from "@/lib/results";
import { useTournament } from "@/lib/liveResults";
import { scoreEverything, scoreSecondChance } from "@/lib/scoring";
import { percentileOf } from "@/lib/leaderboard";
import { upsertBracket } from "@/lib/brackets";
import { champion, resolveKnockout, resolveKnockoutFrom } from "@/lib/knockout";
import { flag } from "@/lib/flags";
import { ViewBracket } from "./ViewBracket";
import { DisplayNamePrompt } from "./DisplayNamePrompt";
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
  transferPoolOwnership,
  type MemberBracket,
  type Pool,
  type PoolMember,
} from "@/lib/pools";
import { getPicksSummary, type UserPicksSummary } from "@/lib/predictionPicks";

// Whether the "Create a pool" form is available. When false, people can only join
// existing pools by invite code. Open = anyone can create their own pool.
const POOL_CREATION_OPEN = true;

export function PoolsView({ onGoToGroupTab }: { onGoToGroupTab?: () => void }) {
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

  return <PoolsAuthed userId={user.id} onGoToGroupTab={onGoToGroupTab} />;
}

function PoolsAuthed({ userId, onGoToGroupTab }: { userId: string; onGoToGroupTab?: () => void }) {
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
        onGoToGroupTab={onGoToGroupTab}
        onBack={() => {
          setSelectedId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DisplayNamePrompt />
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
        {POOL_CREATION_OPEN ? (
          <CreatePoolForm
            userId={userId}
            onCreated={(id) => {
              refresh();
              setSelectedId(id);
            }}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Create a pool</h3>
            <p className="mt-3 text-sm text-slate-500">
              New pool creation is closed for now. Have an invite code? Join a pool on the right.
            </p>
          </div>
        )}
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
  bracketId: string | null;
  display_name: string;
  isYou: boolean;
  totalPoints: number;
  groupPoints: number;
  bonusPoints: number;
  koPoints: number;
  exact: number;
  tiebreaker_total_goals: number | null;
}

function PoolDetail({
  pool,
  currentUserId,
  onBack,
  onGoToGroupTab,
}: {
  pool: Pool;
  currentUserId: string;
  onBack: () => void;
  onGoToGroupTab?: () => void;
}) {
  const { now, isPreview, brackets: myBrackets, createBracket, allRecords } = usePredictions();
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [brackets, setBrackets] = useState<MemberBracket[]>([]);
  const [scBrackets, setScBrackets] = useState<MemberBracket[]>([]);
  const [picksSummary, setPicksSummary] = useState<Map<string, UserPicksSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Global score distribution (every bracket worldwide), so each member's pool row
  // can show the SAME ESPN-style percentile they'd have on the global board — i.e.
  // their standing vs. everyone, not relative to this pool (so #1 here isn't 100%).
  const [globalScores, setGlobalScores] = useState<number[]>([]);
  // Single tournament truth (mock in preview, real ESPN feed otherwise).
  const { truth, bracketResults, groupResultFor, round32 } = useTournament(now, isPreview);

  // My attributed bracket ids in THIS pool (null until set).
  const myMember = members.find((m) => m.user_id === currentUserId);
  const myEntryId = myMember?.bracket_id ?? null;
  const myScId = myMember?.sc_bracket_id ?? null;
  // You can always make a FIRST entry pick (so nobody is ever stuck on the default).
  // Once you've picked one, you can still SWAP it for 30 min after joining — enough
  // to fix an accidental wrong pick — then the entry locks in.
  const ENTRY_CHANGE_WINDOW_MS = 30 * 60 * 1000;
  const joinedAtMs = myMember?.joined_at ? new Date(myMember.joined_at).getTime() : 0;
  const entryWindowOpen =
    !myEntryId || (joinedAtMs > 0 && now.getTime() - joinedAtMs < ENTRY_CHANGE_WINDOW_MS);
  // Second-chance entries can be set during the group→knockout window and lock at
  // knockout kickoff. Real-world deadline (real time) so it's still settable while
  // previewing — you fill an SC bracket from the real R32 once the groups finish.
  const scLocked = isKnockoutStarted(new Date());
  const myScRecord = myScId ? allRecords().find((r) => r.id === myScId) : null;
  const myScBrackets = myBrackets.filter((b) => b.kind === "second_chance");
  const myScChampion =
    myScRecord && round32 ? champion(resolveKnockoutFrom(round32, myScRecord.state.knockout)) : null;
  // Entries lock when the KNOCKOUT stage begins — not the first match. Through the
  // group stage you keep editing your group picks (each locks at its own kickoff)
  // and the bracket auto-updates, so the entry stays live until the bracket is
  // final. Preview-aware → "Preview mid-tournament" shows the locked state.
  const locked = isKnockoutStarted(now);
  const myEntry = myBrackets.find((b) => b.id === myEntryId) ?? null;
  // The champion the entry bracket predicts (shown as "your pick").
  const myEntryRecord = myEntryId ? allRecords().find((r) => r.id === myEntryId) : null;
  const myChampion = myEntryRecord
    ? champion(resolveKnockout(myEntryRecord.state.predictions, myEntryRecord.state.knockout))
    : null;
  const [chooserOpen, setChooserOpen] = useState(false);
  const [scChooserOpen, setScChooserOpen] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setLoading(true);
    (async () => {
      const ms = await getPoolMembers(sb, pool.id);
      setMembers(ms);
      getPicksSummary(sb, ms.map((m) => m.user_id)).then(setPicksSummary);
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
      // Second-chance entries (separate slot, separate leaderboard).
      const scIds = ms.map((m) => m.sc_bracket_id).filter((x): x is string => !!x);
      setScBrackets(await getBracketsByIds(sb, scIds));
      setLoading(false);
    })();
  }, [pool.id, reloadKey]);

  // Pull the global distribution once so pool percentiles match the global board.
  useEffect(() => {
    let on = true;
    fetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { scores?: number[] } | null) => {
        if (on && d?.scores) setGlobalScores(d.scores);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  const [entryError, setEntryError] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");

  // Assign a bracket to this pool's main or second-chance slot. Upserts the
  // bracket FIRST (a just-created one may not have synced yet → FK error
  // otherwise), then links it.
  const assignEntry = async (rec: BracketRecord, slot: "main" | "second_chance" = "main") => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setEntryError("Not signed in / Supabase unavailable.");
      return;
    }
    setEntryError(null);
    const fail = (m: string) => setEntryError(m);
    try {
      const bracketErr = await upsertBracket(sb, currentUserId, rec);
      if (bracketErr) {
        fail(`Step 1 (save bracket) failed: ${bracketErr}`);
        return;
      }
      const res = await setPoolBracket(sb, pool.id, currentUserId, rec.id, slot);
      if (!res.ok) {
        fail(`Step 2 (link to pool) failed: ${res.error ?? "unknown"}`);
        return;
      }
      const col = slot === "second_chance" ? "sc_bracket_id" : "bracket_id";
      setMembers((prev) =>
        prev.map((m) => (m.user_id === currentUserId ? { ...m, [col]: rec.id } : m)),
      );
      setChooserOpen(false);
      setScChooserOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      fail(`Entry error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const pickEntry = (bracketId: string, slot: "main" | "second_chance" = "main") => {
    const rec = allRecords().find((r) => r.id === bracketId);
    if (rec) void assignEntry(rec, slot);
  };

  // Brand-new (or just-joined) members have no entry yet — prompt to pick one,
  // while their 30-min entry-change window is still open.
  useEffect(() => {
    if (!loading && !myEntryId && !locked && entryWindowOpen) setChooserOpen(true);
  }, [loading, myEntryId, locked, entryWindowOpen]);

  // Build the leaderboard: score each member's bracket against the same truth.
  const leaderboard: LeaderboardRow[] = useMemo(() => {
    const groupFixtures: Fixture[] = SCHEDULE;
    const resultFor = groupResultFor;
    const byUser = new Map(brackets.map((b) => [b.user_id, b]));
    const rows: LeaderboardRow[] = members.map((m) => {
      const b = byUser.get(m.user_id);
      const score = b
        ? scoreEverything(b.predictions, b.knockout, groupFixtures, resultFor, truth)
        : null;
      return {
        user_id: m.user_id,
        bracketId: b?.id ?? null,
        display_name: m.display_name ?? "Anonymous",
        isYou: m.user_id === currentUserId,
        totalPoints: score?.total ?? 0,
        groupPoints: score?.group.points ?? 0,
        bonusPoints: score?.bonus.points ?? 0,
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
  }, [members, brackets, groupResultFor, truth, currentUserId]);

  // Predictions (Futures) leaderboard — picks made + odds-weighted points.
  const anyResolved = useMemo(
    () => [...picksSummary.values()].some((s) => s.resolved),
    [picksSummary],
  );
  const predLeaderboard = useMemo(() => {
    const rows = members.map((m) => {
      const s = picksSummary.get(m.user_id);
      return {
        user_id: m.user_id,
        display_name: m.display_name ?? "Anonymous",
        isYou: m.user_id === currentUserId,
        count: s?.count ?? 0,
        potential: s?.potential ?? 0,
        earned: s?.earned ?? 0,
      };
    });
    rows.sort((a, b) =>
      anyResolved
        ? b.earned - a.earned || b.potential - a.potential || a.display_name.localeCompare(b.display_name)
        : b.potential - a.potential || b.count - a.count || a.display_name.localeCompare(b.display_name),
    );
    return rows;
  }, [members, picksSummary, anyResolved, currentUserId]);

  // 🔄 Second-Chance leaderboard — knockout-only, scored from the real R32.
  const scLeaderboard = useMemo(() => {
    const scByUser = new Map(scBrackets.map((b) => [b.user_id, b]));
    const rows = members
      .filter((m) => m.sc_bracket_id)
      .map((m) => {
        const b = scByUser.get(m.user_id);
        const score = b ? scoreSecondChance(b.knockout, round32, truth, b.boosts) : null;
        return {
          user_id: m.user_id,
          display_name: m.display_name ?? "Anonymous",
          isYou: m.user_id === currentUserId,
          points: score?.points ?? 0,
          exact: score?.exact ?? 0,
        };
      });
    rows.sort(
      (a, b) => b.points - a.points || b.exact - a.exact || a.display_name.localeCompare(b.display_name),
    );
    return rows;
  }, [members, scBrackets, round32, truth, currentUserId]);

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

  // If a leaderboard row was clicked, swap to that member's read-only bracket —
  // the same lock-masked "view as them" used on the global board.
  if (viewingMemberId) {
    const m = members.find((x) => x.user_id === viewingMemberId);
    const b = brackets.find((x) => x.user_id === viewingMemberId);
    if (!m || !b) {
      setViewingMemberId(null);
    } else {
      return (
        <ViewBracket
          bracketId={b.id}
          userId={m.user_id}
          name={m.display_name ?? "Anonymous"}
          bracketName=""
          onClose={() => setViewingMemberId(null)}
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

  const onTransfer = async () => {
    const sb = getSupabaseBrowser();
    if (!sb || !transferTo) return;
    const target = members.find((m) => m.user_id === transferTo);
    const name = target?.display_name ?? "this member";
    if (!confirm(`Transfer ownership of "${pool.name}" to ${name}? You'll become a regular member.`)) return;
    const res = await transferPoolOwnership(sb, pool.id, transferTo);
    if (!res.ok) {
      alert(res.error ?? "Couldn't transfer ownership.");
      return;
    }
    onBack(); // ownership changed — return to the list (it refreshes)
  };

  const otherMembers = members.filter((m) => m.user_id !== currentUserId);

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
              ? "🔒 Entries are locked — the knockout stage has started, so you can't change or create one now."
              : "The bracket you're competing with. Tweak your group picks anytime — your bracket updates automatically — right up until the knockouts begin (Jun 28)."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {myEntry ? (
            <div className="text-right">
              {myChampion ? (
                <div className="text-sm font-bold">
                  Your pick: {flag(myChampion.code)} {myChampion.name}
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-500">No champion picked yet</div>
              )}
              <div className="max-w-[12rem] truncate text-[11px] text-slate-400">
                {myEntry.kind === "second_chance" ? "🔄 " : ""}
                {myEntry.name}
              </div>
            </div>
          ) : (
            <span className="text-sm text-slate-400">No entry yet</span>
          )}
          {!locked && entryWindowOpen ? (
            <button
              onClick={() => setChooserOpen(true)}
              className="rounded-md border border-[var(--wc-accent)]/40 px-3 py-1.5 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/10"
            >
              {myEntry ? "Change" : "Choose entry"}
            </button>
          ) : !locked && myEntry ? (
            <span className="text-[11px] text-slate-400" title="Entries lock 30 minutes after you join">
              🔒 Entry locked
            </span>
          ) : null}
        </div>
        {entryError && <p className="w-full text-xs text-red-600">{entryError}</p>}
      </div>

      {(round32 || myScBrackets.length > 0 || myScId) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              🔄 Your second-chance entry
            </div>
            <p className="text-xs text-slate-500">
              {scLocked
                ? "🔒 Locked — the knockout stage has started."
                : "A knockout-only bracket from the real Round of 32, on its own leaderboard. Set it until the knockouts begin (Jun 28)."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {myScRecord ? (
              <div className="text-right">
                {myScChampion ? (
                  <div className="text-sm font-bold">
                    Your pick: {flag(myScChampion.code)} {myScChampion.name}
                  </div>
                ) : (
                  <div className="text-sm font-medium text-slate-500">No champion picked yet</div>
                )}
                <div className="max-w-[12rem] truncate text-[11px] text-slate-400">🔄 {myScRecord.name}</div>
              </div>
            ) : (
              <span className="text-sm text-slate-400">No second-chance entry</span>
            )}
            {!scLocked &&
              (myScBrackets.length > 0 ? (
                <button
                  onClick={() => setScChooserOpen(true)}
                  className="rounded-md border border-[var(--wc-accent)]/40 px-3 py-1.5 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/10"
                >
                  {myScRecord ? "Change" : "Choose entry"}
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Make a 🔄 bracket from the switcher first
                </span>
              ))}
          </div>
          {entryError && <p className="w-full text-xs text-red-600">{entryError}</p>}
        </div>
      )}

      {chooserOpen && !locked && (
        <ChooseEntryModal
          brackets={myBrackets.filter((b) => b.kind !== "second_chance")}
          currentId={myEntryId}
          onPick={(id) => pickEntry(id, "main")}
          onCreate={() => {
            // Make a fresh bracket and send them to fill + submit it; they come
            // back and pick it once it's submitted (drafts can't be entries).
            createBracket();
            setChooserOpen(false);
            onGoToGroupTab?.();
          }}
          onClose={() => setChooserOpen(false)}
        />
      )}

      {scChooserOpen && !scLocked && (
        <ChooseEntryModal
          title="Choose your second-chance entry"
          brackets={myScBrackets}
          currentId={myScId}
          onPick={(id) => pickEntry(id, "second_chance")}
          onClose={() => setScChooserOpen(false)}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          <span>Leaderboard</span>
          <span className="text-[10px] font-normal text-slate-400">
            Tap a name to see their bracket (locked picks only)
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
                <th
                  className="w-14 px-3 py-2 text-right"
                  title="Percentile vs. ALL brackets worldwide — your global standing (ESPN-style), not relative to this pool. Tops out at 99%; the pool's #1 shows their world standing, not necessarily the field's best."
                >
                  PCTL
                </th>
                <th className="hidden w-14 px-3 py-2 text-right sm:table-cell" title="Group-stage points">Grp</th>
                <th className="hidden w-14 px-3 py-2 text-right sm:table-cell" title="R32 exact-position bonus (+10 per team seeded into its exact slot)">Bonus</th>
                <th className="hidden w-14 px-3 py-2 text-right sm:table-cell" title="Knockout points">KO</th>
                <th className="w-12 px-3 py-2 text-right" title="Exact-score predictions">★</th>
                <th className="hidden w-20 px-3 py-2 text-right sm:table-cell" title="Tiebreaker: total goals">TB goals</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r, i) => {
                const clickable = !!r.bracketId;
                return (
                  <tr
                    key={r.user_id}
                    onClick={clickable ? () => setViewingMemberId(r.user_id) : undefined}
                    className={`border-t border-slate-100 dark:border-slate-800 ${r.isYou ? "bg-[var(--wc-accent)]/5 font-semibold" : ""} ${clickable ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/40" : ""}`}
                  >
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      {r.display_name} {r.isYou && <span className="ml-1 text-[10px] text-[var(--wc-accent)]">YOU</span>}
                      {r.bonusPoints > 0 && (
                        <span className="ml-1 rounded bg-emerald-500/15 px-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 sm:hidden">
                          🎯 +{r.bonusPoints}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.totalPoints}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--wc-accent)]">
                      {globalScores.length ? `${percentileOf(globalScores, r.totalPoints)}%` : "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.groupPoints}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-emerald-700 sm:table-cell dark:text-emerald-300">
                      {r.bonusPoints ? `+${r.bonusPoints}` : "—"}
                    </td>
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
          Knockout: points for each team you correctly pick to <strong>reach</strong> a round (R32 +20,
          R16 +40, QF +80, SF/3rd +160, Champion +320), regardless of opponent — plus{" "}
          <span className="font-bold text-emerald-600 dark:text-emerald-400">+10</span> for nailing its
          exact bracket slot (only for teams whose group you called early — 2+ of their games before kickoff).
          Ties broken by KO points, then exact predictions, then tiebreaker total-goals.
        </footer>
      </div>

      {(round32 || scLeaderboard.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <header className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <span>🔄 Second Chance</span>
            <span className="text-[10px] font-normal text-slate-400">Knockout-only, from the real Round of 32</span>
          </header>
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
          ) : scLeaderboard.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              No second-chance entries yet. Once the group stage ends, start a 🔄 Second-Chance bracket
              from the real Round of 32 and set it as your entry below.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="w-8 px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Member</th>
                  <th className="w-12 px-3 py-2 text-right" title="Exact bracket-slot bonuses">★</th>
                  <th className="w-16 px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {scLeaderboard.map((r, i) => (
                  <tr
                    key={r.user_id}
                    className={`border-t border-slate-100 dark:border-slate-800 ${r.isYou ? "bg-[var(--wc-accent)]/5 font-semibold" : ""}`}
                  >
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      {r.display_name} {r.isYou && <span className="ml-1 text-[10px] text-[var(--wc-accent)]">YOU</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {r.exact || ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <footer className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
            Separate board for knockout-only brackets seeded from the real Round of 32 — same advancement
            scoring (reach a round +pts, +10 exact slot), no group points.
          </footer>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          <span>🎯 Predictions</span>
          <span className="text-[10px] font-normal text-slate-400">
            {anyResolved ? "Points from correct calls" : "Picks lock in; points score as results land"}
          </span>
        </header>
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
        ) : predLeaderboard.every((r) => r.count === 0) ? (
          <p className="px-4 py-6 text-sm text-slate-400">
            No one in this pool has made Futures picks yet. Head to the Predictions tab to call the big
            questions.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="w-8 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Member</th>
                <th className="w-16 px-3 py-2 text-right" title="Futures picked">Picks</th>
                <th className="w-20 px-3 py-2 text-right" title={anyResolved ? "Points earned" : "Max points if every pick hits"}>
                  {anyResolved ? "Pts" : "Potential"}
                </th>
              </tr>
            </thead>
            <tbody>
              {predLeaderboard.map((r, i) => (
                <tr
                  key={r.user_id}
                  className={`border-t border-slate-100 dark:border-slate-800 ${r.isYou ? "bg-[var(--wc-accent)]/5 font-semibold" : ""}`}
                >
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    {r.display_name} {r.isYou && <span className="ml-1 text-[10px] text-[var(--wc-accent)]">YOU</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.count || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {anyResolved ? r.earned : r.potential || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
          <strong>Odds-weighted:</strong> a correct pick earns <span className="font-bold">round(10 ÷ chance)</span>,
          capped at 100 — bolder (less likely) calls pay more. {anyResolved ? "" : "Standings show potential points until markets resolve."}
        </footer>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {isOwner ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Transfer ownership
                  </div>
                  <p className="text-xs text-slate-500">
                    {otherMembers.length > 0
                      ? "Hand the pool to another member."
                      : "Once someone else joins, you can hand the pool to them."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    disabled={otherMembers.length === 0}
                    className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--wc-accent)] disabled:opacity-50 dark:border-slate-700"
                  >
                    <option value="">{otherMembers.length ? "Choose member…" : "No other members"}</option>
                    {otherMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name ?? "Anonymous"}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={onTransfer}
                    disabled={!transferTo}
                    className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40 dark:bg-slate-600"
                  >
                    Transfer
                  </button>
                </div>
              </div>
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
  title = "Choose your entry",
}: {
  brackets: BracketSummary[];
  currentId: string | null;
  onPick: (id: string) => void;
  onCreate?: () => void;
  onClose: () => void;
  title?: string;
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
          <div className="text-lg font-extrabold">{title}</div>
          <p className="text-xs text-white/80">
            Pick the bracket you&apos;ll compete with — you can keep editing it as games play.
          </p>
        </div>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto p-3">
          {brackets.map((b) => (
            <button
              key={b.id}
              onClick={() => onPick(b.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                b.id === currentId
                  ? "border-[var(--wc-accent)] bg-[var(--wc-accent)]/10"
                  : "border-slate-200 hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
              }`}
            >
              <span className="truncate font-medium">
                {b.kind === "second_chance" ? "🔄 " : ""}
                {b.name}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                {b.kind === "second_chance" ? "" : `${b.picksMade}/${b.picksTotal}`}
              </span>
            </button>
          ))}
          {onCreate && (
            <button
              onClick={onCreate}
              className="mt-1 flex w-full items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
            >
              ＋ Create a new bracket
            </button>
          )}
          {brackets.length === 0 && !onCreate && (
            <p className="px-2 py-3 text-center text-xs text-slate-400">
              No second-chance brackets yet — make one from the bracket switcher once the group stage ends.
            </p>
          )}
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
