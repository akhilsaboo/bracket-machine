"use client";

import { useEffect, useRef, useState } from "react";
import { usePredictions, MAX_BRACKETS, type BracketRecord } from "@/lib/predictions";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { deleteBracketRow, upsertBracket } from "@/lib/brackets";
import { isKnockoutStarted } from "@/lib/results";
import { useTournament } from "@/lib/liveResults";

const SKIP_DELETE_CONFIRM_KEY = "wc2026-skip-delete-confirm";

export function BracketSwitcher() {
  const {
    brackets,
    activeId,
    activeName,
    switchBracket,
    createBracket,
    renameBracket,
    deleteBracket,
    duplicateBracket,
    allRecords,
    now,
    isPreview,
  } = usePredictions();
  const { user } = useAuth();
  const sb = getSupabaseBrowser();

  // Normal brackets can be created right up until the group stage ends; after
  // that they lock, and second-chance brackets (seeded from the real R32) open.
  const groupStageOver = isKnockoutStarted(now);
  const r32Ready = useTournament(now, isPreview).round32 !== null;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Persist a structural change to Supabase when signed in.
  const pushServer = (rec: BracketRecord) => {
    if (sb && user) void upsertBracket(sb, user.id, rec);
  };

  const handleCreate = (kind?: "second_chance") => {
    const rec = createBracket(
      kind === "second_chance" ? { name: "Second Chance", kind: "second_chance" } : undefined,
    );
    if (rec) {
      pushServer(rec);
      setOpen(false);
    }
  };
  const handleDuplicate = (id: string) => {
    const rec = duplicateBracket(id);
    if (rec) pushServer(rec);
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Server-first when signed in: if the server delete fails (e.g. RLS), keep the
  // bracket so it doesn't silently reappear on the next sync — and show why.
  const doDelete = async (id: string) => {
    if (sb && user) {
      const ok = await deleteBracketRow(sb, id);
      if (!ok) {
        setDeleteError("Couldn't delete on the server (re-run schema.sql in Supabase?). Bracket kept.");
        return;
      }
    }
    setDeleteError(null);
    deleteBracket(id);
  };
  const handleDelete = (id: string, name: string) => {
    if (typeof window !== "undefined" && localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === "1") {
      void doDelete(id);
    } else {
      setPendingDelete({ id, name });
    }
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (dontAsk) localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, "1");
    void doDelete(pendingDelete.id);
    setPendingDelete(null);
  };
  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setDraft(current);
  };
  const commitRename = (id: string) => {
    const rec = allRecords().find((r) => r.id === id);
    renameBracket(id, draft);
    setEditingId(null);
    if (sb && user && rec && draft.trim()) void upsertBracket(sb, user.id, { ...rec, name: draft.trim() });
  };

  const atCap = brackets.length >= MAX_BRACKETS;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-medium transition hover:bg-white/25"
        title="Switch bracket"
      >
        <span className="max-w-[10rem] truncate">{activeName}</span>
        <span className="text-[10px] opacity-80">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="max-h-80 overflow-y-auto py-1">
            {brackets.map((b) => (
              <div
                key={b.id}
                className={`flex items-center gap-1 px-2 py-1.5 text-sm ${
                  b.id === activeId ? "bg-[var(--wc-accent)]/10" : ""
                }`}
              >
                {editingId === b.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(b.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 rounded border border-slate-300 bg-transparent px-1.5 py-0.5 text-sm dark:border-slate-600"
                  />
                ) : (
                  <button
                    onClick={() => {
                      switchBracket(b.id);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center justify-between gap-2 truncate text-left"
                  >
                    <span className="truncate font-medium">
                      {b.kind === "second_chance" && "🔄 "}
                      {b.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {b.kind === "second_chance" ? `${b.predicted}/72` : `${b.picksMade}/${b.picksTotal}`}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => startRename(b.id, b.name)}
                  title="Rename"
                  className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDuplicate(b.id)}
                  title="Duplicate"
                  className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  disabled={atCap}
                >
                  ⧉
                </button>
                <button
                  onClick={() => handleDelete(b.id, b.name)}
                  title="Delete"
                  className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700">
            {!groupStageOver && (
              <button
                onClick={() => handleCreate()}
                disabled={atCap}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/5 disabled:opacity-40"
              >
                <span>+ New bracket</span>
              </button>
            )}
            {r32Ready && (
              <button
                onClick={() => handleCreate("second_chance")}
                disabled={atCap}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/5 disabled:opacity-40"
              >
                <span>🔄 New second-chance bracket</span>
              </button>
            )}
            {groupStageOver && !r32Ready && (
              <p className="px-3 py-2 text-[11px] text-slate-400">
                New brackets lock once the group stage ends — second-chance brackets open as soon
                as the Round of 32 is set.
              </p>
            )}
            <p className="px-3 pb-2 pt-0.5 text-[11px] tabular-nums text-slate-400">
              {brackets.length}/{MAX_BRACKETS} brackets used{atCap ? " — limit reached" : ""}
            </p>
            {deleteError && <p className="px-3 pb-2 text-[11px] text-red-600">{deleteError}</p>}
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 text-slate-800 dark:text-slate-100"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-bold">Delete this bracket?</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              “{pendingDelete.name}” will be permanently removed. This can&apos;t be undone.
            </p>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
              Don&apos;t ask me again
            </label>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
