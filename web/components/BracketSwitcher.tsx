"use client";

import { useEffect, useRef, useState } from "react";
import { usePredictions, MAX_BRACKETS } from "@/lib/predictions";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { deleteBracketRow, upsertBracket } from "@/lib/brackets";

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
  } = usePredictions();
  const { user } = useAuth();
  const sb = getSupabaseBrowser();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
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
  const pushServer = (id: string) => {
    if (!sb || !user) return;
    const rec = allRecords().find((r) => r.id === id);
    if (rec) void upsertBracket(sb, user.id, rec);
  };

  const handleCreate = () => {
    const id = createBracket();
    if (id) pushServer(id); // new bracket also synced via active-change, this is belt-and-braces
  };
  const handleDuplicate = (id: string) => {
    const newId = duplicateBracket(id);
    if (newId) pushServer(newId);
  };
  const handleDelete = (id: string) => {
    deleteBracket(id);
    if (sb && user) void deleteBracketRow(sb, id);
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
                      {b.predicted}/72
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
                  onClick={() => handleDelete(b.id)}
                  title="Delete"
                  className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={atCap}
            className="flex w-full items-center justify-between border-t border-slate-200 px-3 py-2 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/5 disabled:opacity-40 dark:border-slate-700"
          >
            <span>+ New bracket</span>
            <span className="text-[11px] tabular-nums text-slate-400">
              {brackets.length}/{MAX_BRACKETS}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
