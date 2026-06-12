"use client";

import { useEffect, useRef, useState } from "react";
import { GROUP_IDS } from "@/lib/data";
import { allGroupsComplete, withResults } from "@/lib/compute";
import { usePredictions } from "@/lib/predictions";
import { useTournament } from "@/lib/liveResults";
import { useAuth } from "@/lib/auth";
import {
  buildGroupPredictions,
  buildKnockoutWinners,
  type FillModeId,
  type FillOptions,
} from "@/lib/autofill";
import { GroupCard } from "./GroupCard";
import { AutoFillModal } from "./AutoFillModal";
import { WelcomeTour } from "./WelcomeTour";

const AUTOFILL_SEEN_KEY = "wc2026-autofill-seen";
const TOUR_SEEN_KEY = "wc2026-tour-seen";

export function GroupStageView({ onSubmitted }: { onSubmitted?: () => void }) {
  const { predictions, setManyScores, setManyKnockout, bracketSubmitted, setBracketSubmitted, setFillMode, hydrated, now, isPreview } = usePredictions();
  const { user, requestSignIn } = useAuth();
  const { truth } = useTournament(now, isPreview);
  // Count already-played matches (resolved from real results) as done, so a late
  // joiner who only has the still-playable games left can still finish.
  const complete = allGroupsComplete(withResults(predictions, truth?.groupResults ?? {}));

  // First load: show the welcome tour once, then chain into the auto-fill nudge
  // (only when the bracket is still empty).
  const [showTour, setShowTour] = useState(false);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const tourManual = useRef(false); // re-opened via the button (skip auto-fill chain)

  const offerAutoFill = () => {
    const seen = localStorage.getItem(AUTOFILL_SEEN_KEY);
    const isEmpty = Object.keys(predictions).length === 0;
    if (!seen && isEmpty) setShowAutoFill(true);
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!localStorage.getItem(TOUR_SEEN_KEY)) setShowTour(true);
    else offerAutoFill();
    // Run once storage has hydrated; predictions check is a snapshot on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const finishTour = () => {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
    setShowTour(false);
    if (!tourManual.current) offerAutoFill(); // only the first-run tour chains to auto-fill
    tourManual.current = false;
  };

  const openTutorial = () => {
    tourManual.current = true;
    setShowTour(true);
  };

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
    // Record which persona generated this bracket (owner analytics).
    setFillMode(mode);
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
      {showTour && <WelcomeTour onDone={finishTour} />}
      {showAutoFill && <AutoFillModal onApply={applyAutoFill} onClose={dismissAutoFill} />}

      <div className="flex justify-end gap-2">
        <button
          onClick={openTutorial}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-[var(--wc-accent)] hover:text-[var(--wc-accent)] dark:border-slate-600 dark:text-slate-400"
        >
          ℹ️ How to play
        </button>
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
            {bracketSubmitted ? "Update your bracket →" : "See your bracket →"}
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
