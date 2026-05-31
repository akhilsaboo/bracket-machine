"use client";

import { useState } from "react";
import { FILL_MODES, type FillMode, type FillModeId, type FillOptions } from "@/lib/autofill";
import { TEAMS } from "@/lib/data";
import { flag } from "@/lib/flags";

const QUICK = FILL_MODES.filter((m) => m.kind === "quick");
const PERSONAS = FILL_MODES.filter((m) => m.kind === "persona");
const TEAMS_BY_NAME = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name));

interface Props {
  /** Apply a chosen mode. Parent does the actual fill. */
  onApply: (mode: FillModeId, opts: FillOptions) => void;
  /** Dismiss without filling. */
  onClose: () => void;
}

export function AutoFillModal({ onApply, onClose }: Props) {
  const [step, setStep] = useState<"home" | "personas">("home");
  // A persona awaiting its required nation choice (Overconfident Patriot).
  const [pendingNation, setPendingNation] = useState<FillMode | null>(null);

  const pickPersona = (m: FillMode) => {
    if (m.needsNation) setPendingNation(m);
    else onApply(m.id, {});
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="brand-gradient px-6 py-5 text-white">
          <div className="text-lg font-extrabold">⚡ Fill your bracket fast</div>
          <p className="text-xs text-white/80">
            Pick a starting point — you can tweak every score afterward.
          </p>
        </div>

        {pendingNation ? (
          <NationPicker
            mode={pendingNation}
            onConfirm={(nation) => onApply(pendingNation.id, { nation })}
            onBack={() => setPendingNation(null)}
          />
        ) : step === "home" ? (
          <div className="space-y-3 p-5">
            {QUICK.map((m) => (
              <ModeButton key={m.id} mode={m} onPick={() => onApply(m.id, {})} />
            ))}
            <button
              onClick={() => setStep("personas")}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--wc-accent)]/30 bg-[var(--wc-accent)]/5 px-4 py-3 text-left transition hover:bg-[var(--wc-accent)]/10"
            >
              <span>
                <span className="block text-sm font-bold">🤖 Pick an AI persona</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Let a character with opinions fill it for you
                </span>
              </span>
              <span className="text-[var(--wc-accent)]">→</span>
            </button>

            <button
              onClick={onClose}
              className="mt-1 w-full py-2 text-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              No thanks — I'll pick myself
            </button>
          </div>
        ) : (
          <div className="p-5">
            <button
              onClick={() => setStep("home")}
              className="mb-3 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              ← Back
            </button>
            <div className="grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {PERSONAS.map((m) => (
                <PersonaCard key={m.id} mode={m} onPick={() => pickPersona(m)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({ mode, onPick }: { mode: FillMode; onPick: () => void }) {
  const disabled = !mode.implemented;
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 opacity-60 dark:border-slate-700"
          : "border-slate-200 hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
      }`}
    >
      <span>
        <span className="block text-sm font-bold">
          {mode.emoji} {mode.label}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{mode.tagline}</span>
      </span>
      {disabled && <ComingSoon />}
    </button>
  );
}

function PersonaCard({ mode, onPick }: { mode: FillMode; onPick: () => void }) {
  const disabled = !mode.implemented;
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`flex flex-col rounded-xl border p-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 opacity-60 dark:border-slate-700"
          : "border-slate-200 hover:border-[var(--wc-accent)] hover:bg-[var(--wc-accent)]/5 dark:border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">
          {mode.emoji} {mode.label}
        </span>
        {disabled && <ComingSoon />}
      </div>
      <span className="mt-0.5 text-[11px] font-semibold italic text-[var(--wc-accent)]">
        “{mode.tagline}”
      </span>
      <span className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">
        {mode.description}
      </span>
    </button>
  );
}

function NationPicker({
  mode,
  onConfirm,
  onBack,
}: {
  mode: FillMode;
  onConfirm: (nation: string) => void;
  onBack: () => void;
}) {
  const [nation, setNation] = useState("");
  return (
    <div className="p-5">
      <button
        onClick={onBack}
        className="mb-3 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        ← Back
      </button>
      <div className="text-sm font-bold">
        {mode.emoji} {mode.label}
      </div>
      <p className="mt-0.5 mb-3 text-xs text-slate-500 dark:text-slate-400">
        Who's your team? They'll win every match, all the way to the trophy.
      </p>
      <select
        value={nation}
        onChange={(e) => setNation(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-600"
      >
        <option value="">Pick your nation…</option>
        {TEAMS_BY_NAME.map((t) => (
          <option key={t.code} value={t.code}>
            {flag(t.code)} {t.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => nation && onConfirm(nation)}
        disabled={!nation}
        className="mt-4 w-full rounded-full bg-[var(--wc-accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Football's coming home →
      </button>
    </div>
  );
}

function ComingSoon() {
  return (
    <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      Soon
    </span>
  );
}
