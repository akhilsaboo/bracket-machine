"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface Score {
  home: number | null;
  away: number | null;
}
export type Predictions = Record<string, Score>;
export type KnockoutWinners = Record<string, string>; // matchNo -> team code

/** Tournament-award picks keyed by award id (e.g. "golden_boot") -> team code. */
export type AwardPicks = Record<string, string>;

export interface BracketState {
  predictions: Predictions;
  knockout: KnockoutWinners;
  awards: AwardPicks;
  groupSubmitted: boolean;
  bracketSubmitted: boolean;
  tiebreakerGoals: number | null;
}

export type BracketKind = "normal" | "second_chance";

/** One named bracket the user owns. `id` is a client-generated UUID and doubles
 *  as the Supabase row id, so syncing is a clean upsert. */
export interface BracketRecord {
  id: string;
  name: string;
  kind: BracketKind;
  createdAt: string;
  state: BracketState;
}

/** Lightweight view of a bracket for the switcher / manager UI. */
export interface BracketSummary {
  id: string;
  name: string;
  kind: BracketKind;
  createdAt: string;
  predicted: number; // group matches with both scores filled (0..72)
  submitted: boolean; // finalized via "Submit bracket" (required to enter a pool)
}

export const MAX_BRACKETS = 25;

interface PredictionContextValue {
  // --- active bracket: same API the whole app already uses ---
  predictions: Predictions;
  knockout: KnockoutWinners;
  awards: AwardPicks;
  groupSubmitted: boolean;
  bracketSubmitted: boolean;
  tiebreakerGoals: number | null;
  setScore: (id: string, side: "home" | "away", value: number | null) => void;
  /** Bulk-merge scorelines (used by auto-fill). Leaves knockout/awards untouched. */
  setManyScores: (scores: Predictions) => void;
  setKnockoutWinner: (match: number | string, code: string) => void;
  /** Bulk-merge knockout winners (used by auto-fill). */
  setManyKnockout: (winners: KnockoutWinners) => void;
  setAward: (key: string, teamCode: string | null) => void;
  setGroupSubmitted: (v: boolean) => void;
  setBracketSubmitted: (v: boolean) => void;
  setTiebreakerGoals: (v: number | null) => void;
  /** Replace the active bracket's whole state (used when loading from the account). */
  replaceAll: (state: BracketState) => void;
  /** Clear the active bracket. */
  reset: () => void;

  // --- multi-bracket management ---
  brackets: BracketSummary[];
  activeId: string;
  activeName: string;
  activeKind: BracketKind;
  switchBracket: (id: string) => void;
  /** Create a bracket and make it active. Returns the new record, or null if at the cap. */
  createBracket: (opts?: { name?: string; kind?: BracketKind; seed?: BracketState }) => BracketRecord | null;
  renameBracket: (id: string, name: string) => void;
  deleteBracket: (id: string) => void;
  /** Duplicate a bracket (and make the copy active). Returns the new record, or null if at the cap. */
  duplicateBracket: (id: string) => BracketRecord | null;

  // --- sync plumbing (used by BracketSync) ---
  allRecords: () => BracketRecord[];
  importServerBrackets: (records: BracketRecord[]) => void;

  hydrated: boolean;
  /** Current time — real (ticks every minute) unless a preview date is set. */
  now: Date;
  isPreview: boolean;
  setPreviewNow: (iso: string | null) => void;
}

const PredictionContext = createContext<PredictionContextValue | null>(null);
const STORAGE_KEY = "wc2026-brackets-v1";
const LEGACY_KEY = "wc2026-predictions-v3";
const LEGACY_KEY_V2 = "wc2026-predictions-v2";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const emptyState = (): BracketState => ({
  predictions: {},
  knockout: {},
  awards: {},
  groupSubmitted: false,
  bracketSubmitted: false,
  tiebreakerGoals: null,
});

const cloneState = (s: BracketState): BracketState => ({
  predictions: { ...s.predictions },
  knockout: { ...s.knockout },
  awards: { ...s.awards },
  groupSubmitted: s.groupSubmitted,
  bracketSubmitted: s.bracketSubmitted,
  tiebreakerGoals: s.tiebreakerGoals,
});

const predictedCount = (s: BracketState): number =>
  Object.values(s.predictions).filter((p) => p.home !== null && p.away !== null).length;

function newRecord(name: string, kind: BracketKind = "normal", state?: BracketState): BracketRecord {
  return { id: uuid(), name, kind, createdAt: new Date().toISOString(), state: state ?? emptyState() };
}

interface Store {
  records: Record<string, BracketRecord>;
  order: string[];
  activeId: string;
}

/** Build the initial store: migrate a legacy single bracket, else one empty bracket. */
function initialStore(): Store {
  const rec = newRecord("My Bracket");
  return { records: { [rec.id]: rec }, order: [rec.id], activeId: rec.id };
}

export function PredictionProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(initialStore);
  const [hydrated, setHydrated] = useState(false);
  const [previewISO, setPreviewISO] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Always-fresh snapshot for stable callbacks.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  // Tick real time every minute so matches lock/move on their own during play.
  useEffect(() => {
    if (previewISO) return;
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [previewISO]);

  // Hydrate from localStorage (with one-time migration from the single-bracket key).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Store>;
        if (parsed.records && parsed.order && parsed.activeId && parsed.records[parsed.activeId]) {
          setStore({ records: parsed.records, order: parsed.order, activeId: parsed.activeId });
          setHydrated(true);
          return;
        }
      }
      // Migrate a legacy single bracket into the new multi-bracket store.
      const legacy = localStorage.getItem(LEGACY_KEY) ?? localStorage.getItem(LEGACY_KEY_V2);
      if (legacy) {
        const p = JSON.parse(legacy) as Partial<BracketState> & { scores?: Predictions };
        const state: BracketState = {
          ...emptyState(),
          predictions: p.predictions ?? p.scores ?? {},
          knockout: p.knockout ?? {},
          awards: p.awards ?? {},
          groupSubmitted: typeof p.groupSubmitted === "boolean" ? p.groupSubmitted : false,
          bracketSubmitted: typeof p.bracketSubmitted === "boolean" ? p.bracketSubmitted : false,
          tiebreakerGoals: typeof p.tiebreakerGoals === "number" ? p.tiebreakerGoals : null,
        };
        const rec = newRecord("My Bracket", "normal", state);
        setStore({ records: { [rec.id]: rec }, order: [rec.id], activeId: rec.id });
      }
    } catch {
      // ignore corrupt storage — keep the fresh initial store
    }
    setHydrated(true);
  }, []);

  // Persist whenever the store changes.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore quota / private-mode errors
    }
  }, [store, hydrated]);

  // --- helpers ---
  const mutateActive = useCallback((fn: (s: BracketState) => BracketState) => {
    setStore((prev) => {
      const rec = prev.records[prev.activeId];
      if (!rec) return prev;
      return {
        ...prev,
        records: { ...prev.records, [rec.id]: { ...rec, state: fn(rec.state) } },
      };
    });
  }, []);

  // --- active-bracket setters (same shapes as before) ---
  const setScore = useCallback(
    (id: string, side: "home" | "away", value: number | null) => {
      mutateActive((s) => {
        const current = s.predictions[id] ?? { home: null, away: null };
        return { ...s, predictions: { ...s.predictions, [id]: { ...current, [side]: value } } };
      });
    },
    [mutateActive],
  );

  const setManyScores = useCallback(
    (scores: Predictions) => mutateActive((s) => ({ ...s, predictions: { ...s.predictions, ...scores } })),
    [mutateActive],
  );

  const setKnockoutWinner = useCallback(
    (match: number | string, code: string) => {
      const key = String(match);
      mutateActive((s) => {
        if (s.knockout[key] === code) {
          const next = { ...s.knockout };
          delete next[key];
          return { ...s, knockout: next };
        }
        return { ...s, knockout: { ...s.knockout, [key]: code } };
      });
    },
    [mutateActive],
  );

  const setManyKnockout = useCallback(
    (winners: KnockoutWinners) => mutateActive((s) => ({ ...s, knockout: { ...s.knockout, ...winners } })),
    [mutateActive],
  );

  const setAward = useCallback(
    (key: string, teamCode: string | null) => {
      mutateActive((s) => {
        if (teamCode === null) {
          if (!(key in s.awards)) return s;
          const next = { ...s.awards };
          delete next[key];
          return { ...s, awards: next };
        }
        return { ...s, awards: { ...s.awards, [key]: teamCode } };
      });
    },
    [mutateActive],
  );

  const setGroupSubmitted = useCallback(
    (v: boolean) => mutateActive((s) => ({ ...s, groupSubmitted: v })),
    [mutateActive],
  );
  const setBracketSubmitted = useCallback(
    (v: boolean) => mutateActive((s) => ({ ...s, bracketSubmitted: v })),
    [mutateActive],
  );
  const setTiebreakerGoals = useCallback(
    (v: number | null) => mutateActive((s) => ({ ...s, tiebreakerGoals: v })),
    [mutateActive],
  );
  const replaceAll = useCallback((state: BracketState) => mutateActive(() => state), [mutateActive]);
  const reset = useCallback(() => mutateActive(() => emptyState()), [mutateActive]);

  // --- bracket management ---
  const switchBracket = useCallback((id: string) => {
    setStore((prev) => (prev.records[id] ? { ...prev, activeId: id } : prev));
  }, []);

  const createBracket = useCallback(
    (opts?: { name?: string; kind?: BracketKind; seed?: BracketState }): BracketRecord | null => {
      const cur = storeRef.current;
      if (cur.order.length >= MAX_BRACKETS) return null;
      const name = opts?.name?.trim() || `Bracket ${cur.order.length + 1}`;
      const rec = newRecord(name, opts?.kind ?? "normal", opts?.seed ? cloneState(opts.seed) : emptyState());
      setStore((prev) => ({
        records: { ...prev.records, [rec.id]: rec },
        order: [...prev.order, rec.id],
        activeId: rec.id,
      }));
      return rec;
    },
    [],
  );

  const renameBracket = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setStore((prev) => {
      const rec = prev.records[id];
      if (!rec) return prev;
      return { ...prev, records: { ...prev.records, [id]: { ...rec, name: clean } } };
    });
  }, []);

  const deleteBracket = useCallback((id: string) => {
    setStore((prev) => {
      if (!prev.records[id]) return prev;
      // Never drop below one bracket — replace the last one with a fresh empty.
      if (prev.order.length <= 1) {
        const rec = newRecord("My Bracket");
        return { records: { [rec.id]: rec }, order: [rec.id], activeId: rec.id };
      }
      const records = { ...prev.records };
      delete records[id];
      const order = prev.order.filter((x) => x !== id);
      const activeId = prev.activeId === id ? order[0] : prev.activeId;
      return { records, order, activeId };
    });
  }, []);

  const duplicateBracket = useCallback((id: string): BracketRecord | null => {
    const cur = storeRef.current;
    const src = cur.records[id];
    if (!src || cur.order.length >= MAX_BRACKETS) return null;
    const rec = newRecord(`${src.name} (copy)`, src.kind, cloneState(src.state));
    setStore((prev) => ({
      records: { ...prev.records, [rec.id]: rec },
      order: [...prev.order, rec.id],
      activeId: rec.id,
    }));
    return rec;
  }, []);

  // --- sync plumbing ---
  const allRecords = useCallback(() => storeRef.current.order.map((id) => storeRef.current.records[id]), []);

  const importServerBrackets = useCallback((incoming: BracketRecord[]) => {
    setStore((prev) => {
      const records = { ...prev.records };
      const order = [...prev.order];
      for (const r of incoming) {
        if (!records[r.id]) order.push(r.id);
        records[r.id] = r;
      }
      const activeId = records[prev.activeId] ? prev.activeId : order[0];
      return { records, order, activeId };
    });
  }, []);

  const active = store.records[store.activeId] ?? store.records[store.order[0]];
  const activeState = active?.state ?? emptyState();
  const brackets: BracketSummary[] = store.order
    .map((id) => store.records[id])
    .filter(Boolean)
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      createdAt: r.createdAt,
      predicted: predictedCount(r.state),
      submitted: r.state.bracketSubmitted,
    }));

  const now = previewISO ? new Date(previewISO) : new Date(nowMs);

  return (
    <PredictionContext.Provider
      value={{
        predictions: activeState.predictions,
        knockout: activeState.knockout,
        awards: activeState.awards,
        groupSubmitted: activeState.groupSubmitted,
        bracketSubmitted: activeState.bracketSubmitted,
        tiebreakerGoals: activeState.tiebreakerGoals,
        setScore,
        setManyScores,
        setKnockoutWinner,
        setManyKnockout,
        setAward,
        setGroupSubmitted,
        setBracketSubmitted,
        setTiebreakerGoals,
        replaceAll,
        reset,
        brackets,
        activeId: store.activeId,
        activeName: active?.name ?? "My Bracket",
        activeKind: active?.kind ?? "normal",
        switchBracket,
        createBracket,
        renameBracket,
        deleteBracket,
        duplicateBracket,
        allRecords,
        importServerBrackets,
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
