"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Score {
  home: number | null;
  away: number | null;
}
export type Predictions = Record<string, Score>;
export type KnockoutWinners = Record<string, string>; // matchNo -> team code

export interface BracketState {
  predictions: Predictions;
  knockout: KnockoutWinners;
  groupSubmitted: boolean;
  bracketSubmitted: boolean;
  tiebreakerGoals: number | null;
}

interface PredictionContextValue {
  predictions: Predictions;
  knockout: KnockoutWinners;
  groupSubmitted: boolean;
  bracketSubmitted: boolean;
  tiebreakerGoals: number | null;
  setScore: (id: string, side: "home" | "away", value: number | null) => void;
  setKnockoutWinner: (match: number | string, code: string) => void;
  setGroupSubmitted: (v: boolean) => void;
  setBracketSubmitted: (v: boolean) => void;
  setTiebreakerGoals: (v: number | null) => void;
  /** Bulk-replace the whole bracket (used when loading from the account). */
  replaceAll: (state: BracketState) => void;
  reset: () => void;
  hydrated: boolean;
  /** Current time — real (ticks every minute) unless a preview date is set. */
  now: Date;
  isPreview: boolean;
  setPreviewNow: (iso: string | null) => void;
}

const PredictionContext = createContext<PredictionContextValue | null>(null);
const STORAGE_KEY = "wc2026-predictions-v3";

export function PredictionProvider({ children }: { children: ReactNode }) {
  const [predictions, setPredictions] = useState<Predictions>({});
  const [knockout, setKnockout] = useState<KnockoutWinners>({});
  const [groupSubmitted, setGroupSubmitted] = useState(false);
  const [bracketSubmitted, setBracketSubmitted] = useState(false);
  const [tiebreakerGoals, setTiebreakerGoals] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [previewISO, setPreviewISO] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick real time every minute so matches lock/move on their own during play.
  useEffect(() => {
    if (previewISO) return;
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [previewISO]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BracketState>;
        if (parsed.predictions) setPredictions(parsed.predictions);
        if (parsed.knockout) setKnockout(parsed.knockout);
        if (typeof parsed.groupSubmitted === "boolean") setGroupSubmitted(parsed.groupSubmitted);
        if (typeof parsed.bracketSubmitted === "boolean") setBracketSubmitted(parsed.bracketSubmitted);
        if (typeof parsed.tiebreakerGoals === "number" || parsed.tiebreakerGoals === null) {
          setTiebreakerGoals(parsed.tiebreakerGoals ?? null);
        }
      } else {
        // best-effort migration from v2 (scores key was different)
        const v2 = localStorage.getItem("wc2026-predictions-v2");
        if (v2) {
          const p = JSON.parse(v2) as { scores?: Predictions; knockout?: KnockoutWinners };
          if (p.scores) setPredictions(p.scores);
          if (p.knockout) setKnockout(p.knockout);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          predictions,
          knockout,
          groupSubmitted,
          bracketSubmitted,
          tiebreakerGoals,
        } satisfies BracketState),
      );
    } catch {
      // ignore quota / private-mode errors
    }
  }, [predictions, knockout, groupSubmitted, bracketSubmitted, tiebreakerGoals, hydrated]);

  const setScore = useCallback(
    (id: string, side: "home" | "away", value: number | null) => {
      setPredictions((prev) => {
        const current = prev[id] ?? { home: null, away: null };
        return { ...prev, [id]: { ...current, [side]: value } };
      });
    },
    [],
  );

  const setKnockoutWinner = useCallback((match: number | string, code: string) => {
    const key = String(match);
    setKnockout((prev) => {
      if (prev[key] === code) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: code };
    });
  }, []);

  const replaceAll = useCallback((state: BracketState) => {
    setPredictions(state.predictions);
    setKnockout(state.knockout);
    setGroupSubmitted(state.groupSubmitted);
    setBracketSubmitted(state.bracketSubmitted);
    setTiebreakerGoals(state.tiebreakerGoals);
  }, []);

  const reset = useCallback(() => {
    setPredictions({});
    setKnockout({});
    setGroupSubmitted(false);
    setBracketSubmitted(false);
    setTiebreakerGoals(null);
  }, []);

  const now = previewISO ? new Date(previewISO) : new Date(nowMs);

  return (
    <PredictionContext.Provider
      value={{
        predictions,
        knockout,
        groupSubmitted,
        bracketSubmitted,
        tiebreakerGoals,
        setScore,
        setKnockoutWinner,
        setGroupSubmitted,
        setBracketSubmitted,
        setTiebreakerGoals,
        replaceAll,
        reset,
        hydrated,
        now,
        isPreview: previewISO !== null,
        setPreviewNow: setPreviewISO,
      }}
    >
      {children}
    </PredictionContext.Provider>
  );
}

export function usePredictions(): PredictionContextValue {
  const ctx = useContext(PredictionContext);
  if (!ctx) throw new Error("usePredictions must be used within a PredictionProvider");
  return ctx;
}
