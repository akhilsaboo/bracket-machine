"use client";

import { useEffect, useMemo, useState } from "react";
import { allGroupsComplete, round32, type ResolvedFixture } from "@/lib/compute";
import type { Fixture } from "@/lib/data";
import type { Predictions } from "@/lib/predictions";
import {
  buildMockTournament,
  mockGroupResult,
  realRound32,
  type GroupResult,
  type TournamentTruth,
} from "@/lib/results";

export interface LiveResults {
  groupResults: Record<string, GroupResult>;
  knockoutWinners: Record<number, string>;
  updatedAt: string;
}

// Module-level cache so the feed is fetched once and shared across components.
let cached: LiveResults | null = null;
let inflight: Promise<LiveResults | null> | null = null;

async function load(): Promise<LiveResults | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/results")
    .then((r) => (r.ok ? (r.json() as Promise<LiveResults>) : null))
    .then((d) => {
      cached = d;
      inflight = null;
      return d;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}

interface Tournament {
  loading: boolean;
  /** Final result for a fixture, or null if not played / unknown. */
  groupResultFor: (f: Fixture) => GroupResult | null;
  /** Single tournament truth for scoring (group + knockout). */
  truth: TournamentTruth | null;
  /** The real Round of 32, once the group stage is complete. */
  round32: ResolvedFixture[] | null;
}

/** Raw live feed (real mode), fetched + cached. */
function useLiveResults() {
  const [data, setData] = useState<LiveResults | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let on = true;
    // Refresh on mount; during the tournament results change over time.
    cached = null;
    load().then((d) => {
      if (!on) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      on = false;
    };
  }, []);

  return useMemo(() => {
    const groupResults = data?.groupResults ?? {};
    const preds: Predictions = {};
    for (const [id, r] of Object.entries(groupResults)) preds[id] = { home: r.homeGoals, away: r.awayGoals };
    const r32 = allGroupsComplete(preds) ? round32(preds) : null;
    const truth: TournamentTruth | null = data
      ? { groupResults, knockoutWinners: data.knockoutWinners ?? {} }
      : null;
    return { groupResults, truth, round32: r32, loading };
  }, [data, loading]);
}

/**
 * The tournament truth for the current mode: deterministic mock under the
 * "Preview mid-tournament" toggle, real ESPN-fed results otherwise. Components
 * use this instead of branching on isPreview themselves.
 */
export function useTournament(now: Date, isPreview: boolean): Tournament {
  const live = useLiveResults();
  return useMemo(() => {
    if (isPreview) {
      return {
        loading: false,
        groupResultFor: (f: Fixture) => mockGroupResult(f, now),
        truth: buildMockTournament(now),
        round32: realRound32(now, true),
      };
    }
    return {
      loading: live.loading,
      groupResultFor: (f: Fixture) => live.groupResults[f.id] ?? null,
      truth: live.truth,
      round32: live.round32,
    };
  }, [isPreview, now, live]);
}
