"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { deleteBracketRow, loadUserBrackets, upsertBracket } from "@/lib/brackets";
import { getTombstones } from "@/lib/tombstones";
import { usePredictions } from "@/lib/predictions";

/**
 * Syncs the multi-bracket store with Supabase.
 * - On sign-in: load all of the user's brackets and merge them in (server wins
 *   for shared ids), then push any local-only brackets (e.g. created as a guest).
 * - While signed in: debounced upsert of the ACTIVE bracket whenever its content
 *   changes. Structural changes (create / rename / delete) are written by the
 *   bracket switcher itself. Renders nothing.
 */
export function BracketSync() {
  const sb = getSupabaseBrowser();
  const { user } = useAuth();
  const {
    predictions,
    knockout,
    awards,
    bracketSubmitted,
    tiebreakerGoals,
    activeId,
    allRecords,
    importServerBrackets,
    hydrated,
  } = usePredictions();

  const loadingRef = useRef(false);
  const syncedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sign-in: load + merge, then push local-only brackets.
  useEffect(() => {
    if (!sb || !hydrated) return;
    const userId = user?.id ?? null;
    if (!userId) {
      syncedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      loadingRef.current = true;
      const serverRecs = await loadUserBrackets(sb, userId);
      if (cancelled) return;
      // Never resurrect a bracket the user deleted: re-attempt the server delete for
      // any tombstoned bracket still present, and exclude tombstoned ones from the
      // import + the local-only re-push. (Tombstones are forward-only — empty for
      // anyone who hadn't deleted under the new code, so the past is left untouched.)
      const tombstones = getTombstones();
      for (const r of serverRecs) {
        if (tombstones.has(r.id)) void deleteBracketRow(sb, r.id);
      }
      const liveServerRecs = serverRecs.filter((r) => !tombstones.has(r.id));
      const localRecs = allRecords();
      const serverIds = new Set(serverRecs.map((r) => r.id));
      if (liveServerRecs.length > 0) importServerBrackets(liveServerRecs);

      const localOnly = localRecs.filter((r) => !serverIds.has(r.id) && !tombstones.has(r.id));
      for (const r of localOnly) {
        const hasData =
          Object.keys(r.state.predictions).length > 0 || Object.keys(r.state.knockout).length > 0;
        // If the server already has brackets, only push local-only ones that
        // actually contain picks (avoids littering empty guest brackets).
        if (serverRecs.length === 0 || hasData) await upsertBracket(sb, userId, r);
      }
      syncedRef.current = true;
      setTimeout(() => {
        loadingRef.current = false;
      }, 50);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, hydrated, user, allRecords, importServerBrackets]);

  // Debounced save of the active bracket's content.
  useEffect(() => {
    if (!sb || !hydrated || !user || loadingRef.current || !syncedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const rec = allRecords().find((r) => r.id === activeId);
      if (rec && user) void upsertBracket(sb, user.id, rec);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [predictions, knockout, awards, bracketSubmitted, tiebreakerGoals, activeId, sb, hydrated, user, allRecords]);

  return null;
}
