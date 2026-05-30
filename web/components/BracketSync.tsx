"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { loadOrCreatePrimaryBracket, saveBracket } from "@/lib/brackets";
import {
  usePredictions,
  type AwardPicks,
  type BracketState,
  type KnockoutWinners,
  type Predictions,
} from "@/lib/predictions";

/**
 * Syncs the predictions store with the user's Supabase bracket row.
 * - On sign-in: loads the user's bracket; if absent, creates one seeded from the
 *   guest (localStorage) state (the "migration on first sign-in" the user asked for).
 * - While signed in: debounced upsert when predictions / knockout / submission /
 *   tiebreaker change. Renders nothing.
 */
export function BracketSync() {
  const sb = getSupabaseBrowser();
  const { user } = useAuth();
  const {
    predictions,
    knockout,
    awards,
    groupSubmitted,
    bracketSubmitted,
    tiebreakerGoals,
    replaceAll,
    hydrated,
  } = usePredictions();

  // Fresh snapshot of store state for handlers that fire on auth events.
  const stateRef = useRef<BracketState>({
    predictions,
    knockout,
    awards,
    groupSubmitted,
    bracketSubmitted,
    tiebreakerGoals,
  });
  useEffect(() => {
    stateRef.current = {
      predictions,
      knockout,
      awards,
      groupSubmitted,
      bracketSubmitted,
      tiebreakerGoals,
    };
  });

  const rowIdRef = useRef<string | null>(null);
  const submittedAtRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // React to user changes (sign-in / sign-out): load or create on sign-in.
  useEffect(() => {
    if (!sb || !hydrated) return;
    const userId = user?.id ?? null;
    if (!userId) {
      rowIdRef.current = null;
      submittedAtRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      loadingRef.current = true;
      const s = stateRef.current;
      const row = await loadOrCreatePrimaryBracket(sb, userId, {
        predictions: s.predictions,
        knockout: s.knockout,
        awards: s.awards,
        submittedAt: s.bracketSubmitted ? new Date().toISOString() : null,
        tiebreakerGoals: s.tiebreakerGoals,
      });
      if (cancelled) return;
      if (row) {
        rowIdRef.current = row.id;
        submittedAtRef.current = row.submitted_at;
        const hasServerData =
          Object.keys((row.predictions as object) ?? {}).length > 0 ||
          Object.keys((row.knockout as object) ?? {}).length > 0 ||
          Object.keys((row.awards as object) ?? {}).length > 0;
        if (hasServerData) {
          replaceAll({
            predictions: (row.predictions as Predictions) ?? {},
            knockout: (row.knockout as KnockoutWinners) ?? {},
            awards: (row.awards as AwardPicks) ?? {},
            groupSubmitted: stateRef.current.groupSubmitted || !!row.submitted_at,
            bracketSubmitted: !!row.submitted_at,
            tiebreakerGoals: row.tiebreaker_total_goals,
          });
        }
      }
      setTimeout(() => {
        loadingRef.current = false;
      }, 50);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, hydrated, user, replaceAll]);

  // Debounced save when signed in and not currently loading.
  useEffect(() => {
    if (!sb || !hydrated) return;
    if (loadingRef.current || !rowIdRef.current) return;

    if (bracketSubmitted && !submittedAtRef.current) {
      submittedAtRef.current = new Date().toISOString();
    } else if (!bracketSubmitted) {
      submittedAtRef.current = null;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!sb || !rowIdRef.current) return;
      void saveBracket(sb, rowIdRef.current, {
        predictions,
        knockout,
        awards,
        submittedAt: submittedAtRef.current,
        tiebreakerGoals,
      });
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [predictions, knockout, awards, bracketSubmitted, tiebreakerGoals, sb, hydrated]);

  return null;
}
