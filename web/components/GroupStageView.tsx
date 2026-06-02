"use client";

import { useEffect, useState } from "react";
import { GROUP_IDS } from "@/lib/data";
import { allGroupsComplete } from "@/lib/compute";
import { usePredictions } from "@/lib/predictions";
import { useAuth } from "@/lib/auth";
import {
  buildGroupPredictions,
  buildKnockoutWinners,
  type FillModeId,
  type FillOptions,
} from "@/lib/autofill";
import { GroupCard } from "./GroupCard";
import { AutoFillModal } from "./AutoFillModal";

const AUTOFILL_SEEN_KEY = "wc2026-autofill-seen";

export function GroupStageView({ onSubmitted }: { onSubmitted?: () => void }) {
  const { predictions, setManyScores, setManyKnockout, setBracketSubmitted, hydrated } = usePredictions();
  const { user, requestSignIn } = useAuth();
  const complete = allGroupsComplete(predictions);

  // First-load nudge: offer auto-fill once, only when the bracket is still empty.
  const [showAutoFill, setShowAutoFill] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const seen = localStorage.getItem(AUTOFILL_SEEN_KEY);
    const isEmpty = Object.keys(predictions).length === 0;
    if (!seen && isEmpty) setShowAutoFill(true);
    // Only run once storage has hydrated; predictions check is a snapshot on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const dismissAutoFill = () => {
    localStorage.setItem(AUTOFILL_SEEN_KEY, "1");
    setShowAutoFill(false);
  };

  const applyAutoFill = (mode: FillModeId, opts: FillOptions) => {
    const groupScores = buildGroupPredictions(mode, opts);
    setManyScores(groupScores);
    // Knockout winners resolve from the just-filled standings, so merge the new
    // scores in before walking the bracket.
    setManyKnockout(buildKnockoutWinners(mode, { ...predictions, ...groupScores }, opts));
    // A whole new autofill rewrites the bracket, so it reverts to a DRAFT — the
    // user must re-submit for it to count as a pool entry. (Small manual edits,
    // by contrast, leave the submitted status intact and just sync through.)
    setBracketSubmitted(false);
    dismissAutoFill();
    // Send the user to review + submit the freshly filled bracket.
    onSubmitted?.();
  };
  return (
    <div className="space-y-6">
      {showAutoFill && <AutoFillModal onApply={applyAutoFill} onClose={dismissAutoFill} />}

      <div className="flex justify-end">
        <button
          onClick={() => setShowAutoFill(true)}
          className="rounded-full border border-[var(--wc-accent)]/40 px-3 py-1 text-xs font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/10"
        >
          ⚡ Auto-fill
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUP_IDS.map((g) => (
          <GroupCard key={g} group={g} />
        ))}
      </div>
      {complete && (
        <div className="sticky bottom-4 flex flex-col items-center gap-1">
          <button
            onClick={() => onSubmitted?.()}
            className="rounded-full bg-[var(--wc-accent)] px-6 py-3 text-base font-bold text-white shadow-lg ring-4 ring-[var(--wc-accent)]/20 transition hover:opacity-90"
          >
            See your bracket →
          </button>
          {!user && (
            <button
              onClick={requestSignIn}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-md transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Sign in to save your picks across devices
            </button>
          )}
        </div>
      )}
    </div>
  );
}
