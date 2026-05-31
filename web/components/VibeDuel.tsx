"use client";

import { useMemo, useState } from "react";
import { TEAMS } from "@/lib/data";
import { flag } from "@/lib/flags";
import { JerseySvg } from "./JerseySvg";

/** code -> net preference (wins minus losses) from the duel. */
export type VibeRanking = Record<string, number>;

function shufflePairs(): [string, string][] {
  const codes = TEAMS.map((t) => t.code);
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < codes.length; i += 2) pairs.push([codes[i], codes[i + 1]]);
  return pairs;
}

const nameOf = (code: string) => TEAMS.find((t) => t.code === code)?.name ?? code;

export function VibeDuel({
  onConfirm,
  onBack,
}: {
  onConfirm: (ranking: VibeRanking) => void;
  onBack: () => void;
}) {
  const pairs = useMemo(shufflePairs, []);
  const [index, setIndex] = useState(0);
  const [ranking, setRanking] = useState<VibeRanking>({});

  const pair = pairs[index];

  const choose = (winner: string, loser: string) => {
    const next = { ...ranking, [winner]: (ranking[winner] ?? 0) + 1, [loser]: (ranking[loser] ?? 0) - 1 };
    if (index + 1 >= pairs.length) {
      onConfirm(next);
    } else {
      setRanking(next);
      setIndex(index + 1);
    }
  };

  if (!pair) {
    onConfirm(ranking);
    return null;
  }

  const [left, right] = pair;

  return (
    <div className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          ← Back
        </button>
        <span className="text-xs font-medium text-slate-400">
          {index + 1} / {pairs.length}
        </span>
      </div>

      <p className="mb-4 text-center text-sm font-bold">Which kit looks cooler?</p>

      <div className="flex items-stretch gap-3">
        <JerseyChoice code={left} onClick={() => choose(left, right)} />
        <div className="flex items-center text-xs font-bold text-slate-400">vs</div>
        <JerseyChoice code={right} onClick={() => choose(right, left)} />
      </div>

      <button
        onClick={() => onConfirm(ranking)}
        className="mt-4 w-full py-2 text-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        Good enough — fill my bracket →
      </button>
    </div>
  );
}

function JerseyChoice({ code, onClick }: { code: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-slate-200 p-3 transition hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
    >
      <JerseySvg code={code} className="h-24 w-24" />
      <span className="text-sm font-semibold">
        {flag(code)} {nameOf(code)}
      </span>
    </button>
  );
}
