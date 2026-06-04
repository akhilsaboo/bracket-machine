"use client";

import type { ChangeEvent } from "react";
import { team, type Fixture } from "@/lib/data";
import { flag } from "@/lib/flags";
import { usePredictions } from "@/lib/predictions";
import { gradeGroup, type GroupGrade, type GroupResult } from "@/lib/results";
import { MatchInsightButton } from "./MatchInsight";

function clampGoals(raw: string): number | null {
  if (raw === "") return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(99, n));
}

type Outcome = "home" | "away" | "draw" | null;
function outcome(home: number | null, away: number | null): Outcome {
  if (home === null || away === null) return null;
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

export function MatchRow({
  fixture,
  showGroup = false,
  locked = false,
  result,
}: {
  fixture: Fixture;
  showGroup?: boolean;
  locked?: boolean;
  /** When the match has finished, the real result enables grading. */
  result?: GroupResult | null;
}) {
  const { predictions, setScore } = usePredictions();
  const score = predictions[fixture.id] ?? { home: null, away: null };
  const home = team(fixture.home);
  const away = team(fixture.away);
  const result_outcome = outcome(score.home, score.away);
  const grade: GroupGrade = gradeGroup(score, result ?? undefined);

  const onChange = (side: "home" | "away") => (e: ChangeEvent<HTMLInputElement>) =>
    setScore(fixture.id, side, clampGoals(e.target.value));

  // Each tap adds a goal to that team (tally model): tap Argentina → 1-0 → 2-0,
  // then tap the opponent → 2-1, etc. The other side defaults to 0 so the match
  // is fully scored. Use the ↺ reset to clear a pick.
  const pickWinner = (side: "home" | "away") => () => {
    if (locked) return;
    const other = side === "home" ? "away" : "home";
    const cur = side === "home" ? score.home : score.away;
    const otherScore = side === "home" ? score.away : score.home;
    setScore(fixture.id, side, Math.min(99, (cur ?? 0) + 1));
    setScore(fixture.id, other, otherScore ?? 0);
  };

  const setDraw = () => {
    if (locked || result_outcome === "draw") return;
    setScore(fixture.id, "home", 0);
    setScore(fixture.id, "away", 0);
  };

  const resetPick = () => {
    if (locked) return;
    setScore(fixture.id, "home", null);
    setScore(fixture.id, "away", null);
  };

  // Visual: graded results override the locked-red look. User's picked winner
  // turns green when right, red when wrong. Exact-score gets a star badge.
  const winnerSide: "home" | "away" | "draw" | null = result_outcome;
  const teamBtn = (side: "home" | "away") => {
    const picked = winnerSide === side;
    const drewPicked = winnerSide === "draw";
    const lostPicked = winnerSide && winnerSide !== "draw" && winnerSide !== side;
    const base =
      "flex flex-1 items-center gap-2 truncate rounded-lg px-2 py-1.5 text-sm font-medium transition select-none";
    const interactivity = locked ? "cursor-default" : "cursor-pointer";

    // grade overrides default colors when graded.
    // exact (both right) → green; correct (outcome only) → yellow; wrong → red.
    let state = "";
    if (grade === "exact") {
      state = picked
        ? "bg-emerald-500/20 font-bold text-emerald-700 ring-1 ring-emerald-500/60 dark:text-emerald-300"
        : drewPicked
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : lostPicked
            ? "opacity-45"
            : "";
    } else if (grade === "correct") {
      state = picked
        ? "bg-amber-400/20 font-bold text-amber-700 ring-1 ring-amber-400/60 dark:text-amber-300"
        : drewPicked
          ? "bg-amber-400/15 text-amber-700 dark:text-amber-300"
          : lostPicked
            ? "opacity-45"
            : "";
    } else if (grade === "wrong") {
      state = picked
        ? "bg-red-500/20 font-bold text-red-700 ring-1 ring-red-500/60 line-through decoration-red-400 dark:text-red-300"
        : drewPicked
          ? "bg-red-500/15 text-red-700 dark:text-red-300"
          : lostPicked
            ? "opacity-45"
            : "";
    } else {
      state = picked
        ? "bg-emerald-500/15 font-bold text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300"
        : drewPicked
          ? "bg-amber-400/15 text-amber-700 dark:text-amber-300"
          : lostPicked
            ? `opacity-50 ${locked ? "" : "hover:opacity-100 hover:bg-slate-500/10"}`
            : locked
              ? ""
              : "hover:bg-slate-500/10";
    }
    return `${base} ${interactivity} ${state}`;
  };

  const inputCls =
    "h-9 w-10 shrink-0 rounded-md border text-center text-sm font-semibold tabular-nums outline-none disabled:cursor-default border-slate-300 bg-white focus:border-[var(--wc-accent)] focus:ring-2 focus:ring-[var(--wc-accent)]/30 dark:border-slate-700 dark:bg-slate-900 disabled:bg-transparent disabled:text-slate-400";

  const drawBtn = result_outcome === "draw"
    ? "border-amber-400 bg-amber-400 text-white"
    : "border-slate-300 text-slate-400 hover:border-amber-400 hover:text-amber-500 dark:border-slate-600";

  // Grade badge (replaces DRAW button when match is graded).
  const gradeBadge = grade && (
    <div
      title={
        grade === "exact"
          ? `Exact score! Actual: ${result?.homeGoals}-${result?.awayGoals}`
          : grade === "correct"
            ? `Correct outcome. Actual: ${result?.homeGoals}-${result?.awayGoals}`
            : `Wrong. Actual: ${result?.homeGoals}-${result?.awayGoals}`
      }
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        grade === "exact"
          ? "bg-emerald-500 text-white"
          : grade === "correct"
            ? "bg-amber-400 text-white"
            : "bg-red-500 text-white"
      }`}
    >
      {grade === "exact" ? "★" : grade === "correct" ? "✓" : "✗"}
    </div>
  );

  // Container tint follows the grade when present, else the existing locked look.
  const containerTint = grade
    ? grade === "exact"
      ? "bg-emerald-500/5"
      : grade === "correct"
        ? "bg-amber-400/[0.07]"
        : "bg-red-500/[0.08]"
    : locked
      ? "bg-red-500/[0.06] opacity-80"
      : "";

  return (
    <div className={`flex items-center gap-1.5 rounded-md px-1 py-1.5 ${containerTint}`}>
      {showGroup && (
        <span className="w-7 shrink-0 text-center text-[10px] font-semibold text-slate-400">
          {fixture.group}
        </span>
      )}
      <button
        type="button"
        disabled={locked}
        onClick={pickWinner("home")}
        className={`${teamBtn("home")} justify-end text-right`}
      >
        <span className="truncate">{home?.name ?? fixture.home}</span>
        <span className="text-base leading-none">{flag(fixture.home)}</span>
      </button>
      <input
        aria-label={`${home?.name} goals`}
        inputMode="numeric"
        disabled={locked}
        value={score.home ?? ""}
        onChange={onChange("home")}
        className={inputCls}
      />
      {gradeBadge ?? (
        <button
          type="button"
          disabled={locked}
          onClick={setDraw}
          aria-pressed={result_outcome === "draw"}
          title="Set this match as a draw"
          className={`shrink-0 rounded border px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide transition disabled:opacity-50 ${drawBtn}`}
        >
          Draw
        </button>
      )}
      <input
        aria-label={`${away?.name} goals`}
        inputMode="numeric"
        disabled={locked}
        value={score.away ?? ""}
        onChange={onChange("away")}
        className={inputCls}
      />
      <button
        type="button"
        disabled={locked}
        onClick={pickWinner("away")}
        className={teamBtn("away")}
      >
        <span className="text-base leading-none">{flag(fixture.away)}</span>
        <span className="truncate">{away?.name ?? fixture.away}</span>
      </button>
      {!locked && result_outcome !== null && !grade && (
        <button
          type="button"
          onClick={resetPick}
          title="Clear this pick"
          aria-label="Clear this pick"
          className="shrink-0 rounded p-1 text-slate-300 transition hover:text-[var(--wc-accent)] dark:text-slate-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <MatchInsightButton homeCode={fixture.home} awayCode={fixture.away} />
    </div>
  );
}
