"use client";

import { BRACKET_LAYOUT, champion, type KOMatch } from "@/lib/knockout";
import { flag } from "@/lib/flags";
import type { KnockoutResult } from "@/lib/results";

const ROUND_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
};

function Pick({
  team,
  isWinner,
  decided,
  onPick,
  align = "left",
  isActualWinner = false,
  graded = false,
}: {
  team: KOMatch["home"];
  isWinner: boolean;
  decided: boolean;
  onPick?: (code: string) => void;
  align?: "left" | "right";
  isActualWinner?: boolean;
  graded?: boolean;
}) {
  const correct = graded && isWinner && isActualWinner;
  const wrong = graded && isWinner && !isActualWinner;
  const truthBadge = graded && isActualWinner && !isWinner;
  const interactive = !!onPick && !!team;

  const cls = [
    "flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium truncate w-full transition",
    align === "right" ? "flex-row-reverse text-right" : "text-left",
    !team
      ? "cursor-default text-slate-400 italic"
      : interactive
        ? "cursor-pointer hover:bg-slate-500/10"
        : "cursor-default",
    correct
      ? "bg-amber-400/25 font-bold text-amber-700 ring-1 ring-amber-400/60 dark:text-amber-300"
      : wrong
        ? "bg-red-500/20 font-bold text-red-700 line-through decoration-red-400 dark:text-red-300"
        : isWinner
          ? "bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300"
          : truthBadge
            ? "bg-emerald-500/10 text-emerald-700/80 italic dark:text-emerald-300/80"
            : decided && !isWinner && team
              ? "opacity-45"
              : "",
  ].join(" ");

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={() => interactive && team && onPick!(team.code)}
      className={cls}
    >
      <span className="text-sm leading-none">{team ? flag(team.code) : "·"}</span>
      <span className="truncate">{team?.name ?? "TBD"}</span>
      {correct && <span className="ml-auto text-[10px] font-bold">✓</span>}
      {wrong && <span className="ml-auto text-[10px] font-bold">✗</span>}
      {truthBadge && <span className="ml-auto text-[9px] opacity-75">(actual)</span>}
    </button>
  );
}

function MatchBox({
  m,
  onPick,
  align = "left",
  result,
}: {
  m: KOMatch;
  onPick?: (match: number, code: string) => void;
  align?: "left" | "right";
  result?: KnockoutResult | null;
}) {
  const decided = !!m.winner;
  const graded = !!result;
  const actualHome = graded && result!.winnerCode === m.home?.code;
  const actualAway = graded && result!.winnerCode === m.away?.code;
  const pickFor = onPick ? (code: string) => onPick(m.match, code) : undefined;
  return (
    <div className="w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <Pick
        team={m.home}
        isWinner={!!m.winner && m.winner.code === m.home?.code}
        decided={decided}
        onPick={pickFor}
        align={align}
        isActualWinner={actualHome}
        graded={graded}
      />
      <div className="h-px bg-slate-200 dark:bg-slate-700" />
      <Pick
        team={m.away}
        isWinner={!!m.winner && m.winner.code === m.away?.code}
        decided={decided}
        onPick={pickFor}
        align={align}
        isActualWinner={actualAway}
        graded={graded}
      />
    </div>
  );
}

function Column({
  label,
  matches,
  resolved,
  onPick,
  align = "left",
  getResult,
}: {
  label?: string;
  matches: number[];
  resolved: Map<number, KOMatch>;
  onPick?: (match: number, code: string) => void;
  align?: "left" | "right";
  getResult?: (no: number) => KnockoutResult | null;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 h-4 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label ?? ""}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {matches.map((no) => (
          <MatchBox
            key={no}
            m={resolved.get(no)!}
            onPick={onPick}
            align={align}
            result={getResult?.(no) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

export interface BracketTreeProps {
  resolved: Map<number, KOMatch>;
  onPick?: (match: number, code: string) => void;
  getResult?: (no: number) => KnockoutResult | null;
}

export function BracketTree({ resolved, onPick, getResult }: BracketTreeProps) {
  const L = BRACKET_LAYOUT.left;
  const R = BRACKET_LAYOUT.right;
  const finalM = resolved.get(BRACKET_LAYOUT.final)!;
  const thirdM = resolved.get(BRACKET_LAYOUT.third)!;
  const champ = champion(resolved);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-h-[760px] min-w-max items-stretch gap-4">
        <Column label={ROUND_LABEL.R32} matches={L.R32} resolved={resolved} onPick={onPick} getResult={getResult} />
        <Column label={ROUND_LABEL.R16} matches={L.R16} resolved={resolved} onPick={onPick} getResult={getResult} />
        <Column label={ROUND_LABEL.QF} matches={L.QF} resolved={resolved} onPick={onPick} getResult={getResult} />
        <Column label={ROUND_LABEL.SF} matches={L.SF} resolved={resolved} onPick={onPick} getResult={getResult} />

        <div className="flex flex-col items-center justify-center px-2">
          <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide text-[var(--wc-accent)]">
            Final
          </div>
          <MatchBox m={finalM} onPick={onPick} result={getResult?.(BRACKET_LAYOUT.final) ?? null} />
          <div className="mt-4 w-44 rounded-lg border-2 border-[var(--wc-accent)] bg-[var(--wc-accent)]/5 p-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--wc-accent)]">Champion</div>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm font-bold">
              {champ ? (
                <>
                  <span className="text-lg leading-none">{flag(champ.code)}</span>
                  {champ.name}
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          </div>
          <div className="mt-4 w-44">
            <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Third place
            </div>
            <MatchBox m={thirdM} onPick={onPick} result={getResult?.(BRACKET_LAYOUT.third) ?? null} />
          </div>
        </div>

        <Column label={ROUND_LABEL.SF} matches={R.SF} resolved={resolved} onPick={onPick} align="right" getResult={getResult} />
        <Column label={ROUND_LABEL.QF} matches={R.QF} resolved={resolved} onPick={onPick} align="right" getResult={getResult} />
        <Column label={ROUND_LABEL.R16} matches={R.R16} resolved={resolved} onPick={onPick} align="right" getResult={getResult} />
        <Column label={ROUND_LABEL.R32} matches={R.R32} resolved={resolved} onPick={onPick} align="right" getResult={getResult} />
      </div>
    </div>
  );
}
