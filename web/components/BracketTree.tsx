"use client";

import { BRACKET_LAYOUT, champion, type KOMatch } from "@/lib/knockout";
import { flag } from "@/lib/flags";
import { knockoutPointsForMatch, koBucketOf, type Boosts, type KOPickGrade } from "@/lib/scoring";

const ROUND_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
};

export type GradePick = (matchNo: number, pickedCode: string | undefined) => KOPickGrade | null;

function Pick({
  team,
  isWinner,
  decided,
  onPick,
  align = "left",
  grade = null,
  pts = 0,
}: {
  team: KOMatch["home"];
  isWinner: boolean;
  decided: boolean;
  onPick?: (code: string) => void;
  align?: "left" | "right";
  grade?: KOPickGrade | null; // grade for the winning seat (null = ungraded)
  pts?: number;
}) {
  // Advancement grading: green if the picked team really reached this round,
  // red if it didn't. The exact-slot bonus shows as a small +10 chip.
  const advanced = isWinner && grade?.advanced === true;
  const wrong = isWinner && grade != null && grade.advanced === false;
  const interactive = !!onPick && !!team;

  const cls = [
    "flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium truncate w-full transition",
    align === "right" ? "flex-row-reverse text-right" : "text-left",
    !team
      ? "cursor-default text-slate-400 italic"
      : interactive
        ? "cursor-pointer hover:bg-slate-500/10"
        : "cursor-default",
    advanced
      ? "bg-emerald-500/20 font-bold text-emerald-700 ring-1 ring-emerald-500/60 dark:text-emerald-300"
      : wrong
        ? "bg-red-500/20 font-bold text-red-700 line-through decoration-red-400 dark:text-red-300"
        : isWinner
          ? "bg-emerald-500/15 font-bold text-emerald-700 dark:text-emerald-300"
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
      {advanced && (
        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold">
          +{pts}
          {grade?.exact && (
            <span className="rounded bg-emerald-500/25 px-1" title="Exact bracket position">
              +10
            </span>
          )}
        </span>
      )}
      {wrong && <span className="ml-auto text-[10px] font-bold">✗</span>}
    </button>
  );
}

/** The Double-or-Nothing strip under a stakeable match. Off → faint prompt; on →
 *  highlighted stake showing the math, or the settled result once graded. */
function StakeBar({
  base,
  staked,
  grade,
  disabled,
  onToggle,
}: {
  base: number;
  staked: boolean;
  grade: KOPickGrade | null;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!staked) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        title="Stake this pick: double the points if it lands, lose them if it misses"
        className="block w-full border-t border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-amber-500/10 hover:text-amber-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:border-slate-700"
      >
        ✦ Double or Nothing
      </button>
    );
  }
  const result = grade?.advanced === true ? "win" : grade?.advanced === false ? "miss" : null;
  const label =
    result === "win" ? `⚡ Doubled +${base * 2}` : result === "miss" ? `⚡ Lost −${base}` : `⚡ 2× · +${base * 2} / −${base}`;
  const tone =
    result === "win"
      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
      : result === "miss"
        ? "border-red-400/50 bg-red-500/20 text-red-700 dark:text-red-300"
        : "border-amber-400/50 bg-amber-500/20 text-amber-700 dark:text-amber-300";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={disabled ? "Stake locked — this round is underway" : "Click to remove this stake"}
      className={`block w-full border-t px-2 py-1 text-center text-[10px] font-bold transition ${tone} disabled:cursor-default`}
    >
      {label}
    </button>
  );
}

function MatchBox({
  m,
  onPick,
  align = "left",
  gradePick,
  boosts,
  onBoost,
  stakeDecided,
}: {
  m: KOMatch;
  onPick?: (match: number, code: string) => void;
  align?: "left" | "right";
  gradePick?: GradePick;
  boosts?: Boosts;
  onBoost?: (match: number) => void;
  stakeDecided?: Set<number>;
}) {
  const decided = !!m.winner;
  const grade = m.winner && gradePick ? gradePick(m.match, m.winner.code) : null;
  const pts = knockoutPointsForMatch(m.match);
  const homeWins = !!m.winner && m.winner.code === m.home?.code;
  const awayWins = !!m.winner && m.winner.code === m.away?.code;
  const pickFor = onPick ? (code: string) => onPick(m.match, code) : undefined;

  // Double-or-Nothing: stakeable when boosting is on and this match has a round
  // bucket (the 3rd-place playoff has none). Staked → highlighted. You can only
  // SET a new stake on a pick you've made whose result isn't already in.
  const bucket = koBucketOf(m.match);
  const stakeable = !!onBoost && bucket !== null && bucket !== "third";
  const staked = stakeable && bucket ? boosts?.[bucket] === m.match : false;
  const stakeLocked = !!stakeDecided?.has(m.match);
  const canToggle = stakeable && (staked || (!!m.winner && !stakeLocked));
  const showBar = stakeable && (staked || (!!m.winner && !stakeLocked));

  return (
    <div
      className={`w-44 overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-900 ${
        staked
          ? "border-amber-400 ring-2 ring-amber-400/60"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <Pick
        team={m.home}
        isWinner={homeWins}
        decided={decided}
        onPick={pickFor}
        align={align}
        grade={homeWins ? grade : null}
        pts={pts}
      />
      <div className="h-px bg-slate-200 dark:bg-slate-700" />
      <Pick
        team={m.away}
        isWinner={awayWins}
        decided={decided}
        onPick={pickFor}
        align={align}
        grade={awayWins ? grade : null}
        pts={pts}
      />
      {showBar && (
        <StakeBar
          base={pts}
          staked={staked}
          grade={staked ? grade : null}
          disabled={!canToggle}
          onToggle={() => onBoost!(m.match)}
        />
      )}
    </div>
  );
}

function Column({
  label,
  matches,
  resolved,
  onPick,
  align = "left",
  gradePick,
  boosts,
  onBoost,
  stakeDecided,
}: {
  label?: string;
  matches: number[];
  resolved: Map<number, KOMatch>;
  onPick?: (match: number, code: string) => void;
  align?: "left" | "right";
  gradePick?: GradePick;
  boosts?: Boosts;
  onBoost?: (match: number) => void;
  stakeDecided?: Set<number>;
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
            gradePick={gradePick}
            boosts={boosts}
            onBoost={onBoost}
            stakeDecided={stakeDecided}
          />
        ))}
      </div>
    </div>
  );
}

export interface BracketTreeProps {
  resolved: Map<number, KOMatch>;
  onPick?: (match: number, code: string) => void;
  gradePick?: GradePick;
  /** Double-or-Nothing (second-chance brackets): current stakes + toggle handler.
   *  When `onBoost` is omitted, no stake controls render. */
  boosts?: Boosts;
  onBoost?: (match: number) => void;
  /** Matches whose real result is already in — their stake can't be newly set. */
  stakeDecided?: Set<number>;
}

export function BracketTree({ resolved, onPick, gradePick, boosts, onBoost, stakeDecided }: BracketTreeProps) {
  const L = BRACKET_LAYOUT.left;
  const R = BRACKET_LAYOUT.right;
  const finalM = resolved.get(BRACKET_LAYOUT.final)!;
  const thirdM = resolved.get(BRACKET_LAYOUT.third)!;
  const champ = champion(resolved);
  const sp = { boosts, onBoost, stakeDecided }; // Double-or-Nothing props, shared

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-h-[760px] min-w-max items-stretch gap-4">
        <Column label={ROUND_LABEL.R32} matches={L.R32} resolved={resolved} onPick={onPick} gradePick={gradePick} {...sp} />
        <Column label={ROUND_LABEL.R16} matches={L.R16} resolved={resolved} onPick={onPick} gradePick={gradePick} {...sp} />
        <Column label={ROUND_LABEL.QF} matches={L.QF} resolved={resolved} onPick={onPick} gradePick={gradePick} {...sp} />
        <Column label={ROUND_LABEL.SF} matches={L.SF} resolved={resolved} onPick={onPick} gradePick={gradePick} {...sp} />

        <div className="flex flex-col items-center justify-center px-2">
          <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide text-[var(--wc-accent)]">
            Final
          </div>
          <MatchBox m={finalM} onPick={onPick} gradePick={gradePick} {...sp} />
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
            <MatchBox m={thirdM} onPick={onPick} gradePick={gradePick} {...sp} />
          </div>
        </div>

        <Column label={ROUND_LABEL.SF} matches={R.SF} resolved={resolved} onPick={onPick} align="right" gradePick={gradePick} {...sp} />
        <Column label={ROUND_LABEL.QF} matches={R.QF} resolved={resolved} onPick={onPick} align="right" gradePick={gradePick} {...sp} />
        <Column label={ROUND_LABEL.R16} matches={R.R16} resolved={resolved} onPick={onPick} align="right" gradePick={gradePick} {...sp} />
        <Column label={ROUND_LABEL.R32} matches={R.R32} resolved={resolved} onPick={onPick} align="right" gradePick={gradePick} {...sp} />
      </div>
    </div>
  );
}
