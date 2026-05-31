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
  const { predictions, setManyScores, setManyKnockout, groupSubmitted, setGroupSubmitted, hydrated } =
    usePredictions();
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
    dismissAutoFill();
  };
  // MODULAR: this initial-only "Submit Group Stage" gate is easy to remove —
  // delete the block below and the GroupStageView call-site's onSubmitted prop.
  const showSubmit = complete && !groupSubmitted;

  const handleSubmit = () => {
    if (!user) {
      requestSignIn();
      return;
    }
    setGroupSubmitted(true);
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
      {showSubmit && (
        <div className="sticky bottom-4 flex flex-col items-center gap-1">
          <button
            onClick={handleSubmit}
            className="rounded-full bg-[var(--wc-accent)] px-6 py-3 text-base font-bold text-white shadow-lg ring-4 ring-[var(--wc-accent)]/20 transition hover:opacity-90"
          >
            {user ? "Submit group stage → Build my bracket" : "Sign in to submit group stage"}
          </button>
          {!user && (
            <p className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-300">
              Your picks are safe — they'll attach to your account when you sign in.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
