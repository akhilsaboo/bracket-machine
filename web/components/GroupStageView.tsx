"use client";

import { GROUP_IDS } from "@/lib/data";
import { allGroupsComplete } from "@/lib/compute";
import { usePredictions } from "@/lib/predictions";
import { useAuth } from "@/lib/auth";
import { GroupCard } from "./GroupCard";

export function GroupStageView({ onSubmitted }: { onSubmitted?: () => void }) {
  const { predictions, groupSubmitted, setGroupSubmitted } = usePredictions();
  const { user, requestSignIn } = useAuth();
  const complete = allGroupsComplete(predictions);
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
