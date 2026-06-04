"use client";

import { useState } from "react";
import { gd, points } from "@/lib/engine";
import { GROUP_IDS } from "@/lib/data";
import { allGroupsComplete, groupIsComplete, thirdPlaceRanking } from "@/lib/compute";
import { champion, resolveKnockout, resolveKnockoutFrom, type KOMatch } from "@/lib/knockout";
import { flag } from "@/lib/flags";
import { usePredictions } from "@/lib/predictions";
import { useAuth } from "@/lib/auth";
import { isKnockoutStarted } from "@/lib/results";
import { useTournament } from "@/lib/liveResults";
import { knockoutGrader } from "@/lib/scoring";
import { BracketTree } from "./BracketTree";

export function BracketView({ onGoToPools }: { onGoToPools?: () => void }) {
  const {
    predictions,
    knockout,
    setKnockoutWinner,
    bracketSubmitted,
    setBracketSubmitted,
    tiebreakerGoals,
    setTiebreakerGoals,
    isPreview,
    now,
    activeKind,
  } = usePredictions();
  const { user, requestSignIn } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [shareStep, setShareStep] = useState(false); // post-submit: share + pools
  const [shareCopied, setShareCopied] = useState(false);
  const [goalsInput, setGoalsInput] = useState<string>(
    tiebreakerGoals === null ? "" : String(tiebreakerGoals),
  );

  const isSecondChance = activeKind === "second_chance";
  // Tournament truth + real R32: mock under preview, real ESPN feed otherwise.
  const { truth, round32: realR32 } = useTournament(now, isPreview);

  let resolved: Map<number, KOMatch>;
  if (isSecondChance) {
    const r32 = realR32;
    if (!r32) {
      return (
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            🔄 Second-chance bracket
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Its Round of 32 fills in with the real qualified teams once the group stage
            finishes. Check back then!
          </p>
        </div>
      );
    }
    resolved = resolveKnockoutFrom(r32, knockout);
  } else {
    if (!allGroupsComplete(predictions)) {
      const done = GROUP_IDS.filter((g) => groupIsComplete(g, predictions)).length;
      return (
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Predict all 12 groups to generate your bracket.
          </p>
          <p className="mt-1 text-xs text-slate-400">{done}/12 groups complete</p>
        </div>
      );
    }
    resolved = resolveKnockout(predictions, knockout)!;
  }

  const onPick = (match: number, code: string) => setKnockoutWinner(match, code);

  // Grade against the tournament truth (same source the pool leaderboards use).
  // Advancement + exact bonus.
  const gradePick = truth ? knockoutGrader(truth) : undefined;

  const champ = champion(resolved);
  const thirds = isSecondChance ? [] : thirdPlaceRanking(predictions);
  // A normal bracket locks once the knockout stage begins — by then the group
  // stage is over and your predictions are final. (Second-chance brackets are
  // meant to be filled during the knockouts, so they stay editable.) Uses the
  // preview-aware clock, so "Preview mid-tournament" shows the locked state.
  const locked = !isSecondChance && isKnockoutStarted(now);
  const canSubmit = !!champ && !bracketSubmitted && !locked;

  const confirmSubmit = () => {
    // The tiebreaker is optional — submit with null when left blank.
    const trimmed = goalsInput.trim();
    const n = trimmed === "" ? null : parseInt(trimmed, 10);
    if (n !== null && (Number.isNaN(n) || n < 0)) return;
    setTiebreakerGoals(n);
    setBracketSubmitted(true);
    setShareStep(true); // celebrate + prompt to share / join a pool
  };

  const closeModal = () => {
    setModalOpen(false);
    setShareStep(false);
    setShareCopied(false);
  };

  const handleShare = async () => {
    const url = "https://bracketmachine.app";
    const text = `I built my 2026 World Cup bracket on Bracket Machine 🏆 — ${champ ? `${champ.name} for the title. ` : ""}make yours:`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Bracket Machine", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className="space-y-8">
      {locked ? (
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          🔒 Bracket locked — the knockout stage has started. Want back in? Try a Second-Chance bracket.
        </div>
      ) : (
        bracketSubmitted && (
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span>✓ Bracket submitted</span>
            {tiebreakerGoals !== null && <span className="opacity-70">· Tiebreaker: {tiebreakerGoals} goals</span>}
          </div>
        )
      )}

      <BracketTree resolved={resolved} onPick={locked ? undefined : onPick} gradePick={gradePick} />

      {canSubmit && (
        <div className="sticky bottom-4 flex flex-col items-center gap-1">
          <button
            onClick={() => {
              if (!user) {
                requestSignIn();
                return;
              }
              setGoalsInput(tiebreakerGoals === null ? "" : String(tiebreakerGoals));
              setModalOpen(true);
            }}
            className="rounded-full bg-[var(--wc-accent)] px-6 py-3 text-base font-bold text-white shadow-lg ring-4 ring-[var(--wc-accent)]/20 transition hover:opacity-90"
          >
            {user ? "Submit bracket" : "Sign in to submit bracket"}
          </button>
          {!user && (
            <p className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-300">
              Your bracket is safe — it'll attach to your account when you sign in.
            </p>
          )}
        </div>
      )}

      {!isSecondChance && (
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Best third-placed teams (8 advance)
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {thirds.map((r, i) => (
            <div
              key={r.team.code}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                i < 8
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                  : "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <span className="w-4 text-xs text-slate-400">{i + 1}</span>
              <span>{flag(r.team.code)}</span>
              <span className="flex-1 truncate font-medium">{r.team.name}</span>
              <span className="text-xs text-slate-400">
                {points(r)}p {gd(r) >= 0 ? `+${gd(r)}` : gd(r)}
              </span>
            </div>
          ))}
        </div>
      </section>
      )}

      {modalOpen && champ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="brand-gradient p-6 text-center text-white">
              {shareStep ? (
                <>
                  <div className="text-4xl leading-none">🎉</div>
                  <div className="mt-2 text-2xl font-extrabold">Your bracket is in!</div>
                  <div className="mt-1 flex items-center justify-center gap-2 text-sm opacity-90">
                    <span className="text-lg leading-none">{flag(champ.code)}</span>
                    {champ.name} for the trophy
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">Your champion</div>
                  <div className="mt-2 text-6xl leading-none">{flag(champ.code)}</div>
                  <div className="mt-2 text-2xl font-extrabold">{champ.name}</div>
                  <div className="text-xs opacity-80">2026 World Cup, per your bracket</div>
                </>
              )}
            </div>

            {shareStep ? (
              <div className="space-y-2 p-5">
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Get friends in — invite them to make their own bracket and compete in a pool.
                </p>
                <button
                  onClick={handleShare}
                  className="w-full rounded-md bg-[var(--wc-accent)] px-3 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                >
                  {shareCopied ? "✓ Link copied!" : "📣 Share & invite friends"}
                </button>
                <button
                  onClick={() => {
                    closeModal();
                    onGoToPools?.();
                  }}
                  className="w-full rounded-md border border-[var(--wc-accent)]/40 px-3 py-2.5 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/10"
                >
                  👥 Create or join a pool →
                </button>
                <button
                  onClick={closeModal}
                  className="w-full rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-3 p-5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Tiebreaker: total goals scored in the tournament{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={goalsInput}
                    onChange={(e) => setGoalsInput(e.target.value)}
                    placeholder="e.g. 168"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--wc-accent)] dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  Optional — if two brackets tie on points, whoever is closer to the real total wins.
                  Skip it and you'll just lose ties to someone who guessed.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Keep editing
                  </button>
                  <button
                    onClick={confirmSubmit}
                    className="flex-1 rounded-md bg-[var(--wc-accent)] px-3 py-2 text-sm font-bold text-white transition hover:opacity-90"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
