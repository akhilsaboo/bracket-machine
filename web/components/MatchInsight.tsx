"use client";

import { useRef, useState } from "react";
import { flag } from "@/lib/flags";
import { fetchInsight, type MatchInsight } from "@/lib/insights";

export function MatchInsightButton({
  homeCode,
  awayCode,
  className,
}: {
  homeCode: string;
  awayCode: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MatchInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // Fallback voice if Google TTS isn't configured (the robotic-but-free browser one).
  const browserSpeak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const pick =
      voices.find((v) => /(Daniel|Arthur|George|Oliver|Google UK English Male)/i.test(v.name)) ||
      voices.find((v) => /en-GB/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang));
    if (pick) u.voice = pick;
    u.rate = 1.08;
    u.pitch = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const toggleRecap = async (text: string) => {
    if (speaking) {
      stopPlayback();
      return;
    }
    setSpeaking(true);
    try {
      // Real (NotebookLM-grade) audio via Google TTS; cached per modal instance.
      if (!audioUrlRef.current) {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!r.ok) throw new Error("tts unavailable");
        audioUrlRef.current = URL.createObjectURL(await r.blob());
      }
      const audio = new Audio(audioUrlRef.current);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch {
      browserSpeak(text); // graceful fallback
    }
  };

  const close = () => {
    stopPlayback();
    setOpen(false);
  };

  const openPanel = async () => {
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      setData(await fetchInsight(homeCode, awayCode));
    } catch {
      // leave data null; modal shows a generic message
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title="AI insights"
        className={
          className ??
          "shrink-0 rounded p-1 text-sm text-slate-400 transition hover:text-[var(--wc-accent)]"
        }
      >
        📰
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="brand-gradient px-5 py-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">
                AI insight
              </div>
              <div className="mt-1 text-lg font-extrabold">
                {flag(homeCode)} {data?.homeName ?? homeCode} <span className="opacity-70">vs</span>{" "}
                {data?.awayName ?? awayCode} {flag(awayCode)}
              </div>
            </div>

            <div className="space-y-4 p-5 text-sm">
              {loading || !data ? (
                <p className="py-6 text-center text-slate-400">Generating insight…</p>
              ) : !data.configured ? (
                <p className="py-2 text-slate-500 dark:text-slate-400">
                  AI insights aren&apos;t turned on yet. Add an <code>ANTHROPIC_API_KEY</code> (and an
                  optional <code>THE_ODDS_API_KEY</code> for live odds) to enable them.
                </p>
              ) : data.error ? (
                <p className="py-2 text-slate-500 dark:text-slate-400">{data.error}</p>
              ) : (
                <>
                  {data.odds && (
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <span>Win probability</span>
                        <span className="normal-case opacity-70">{data.odds.source}</span>
                      </div>
                      <OddsBar odds={data.odds} homeCode={homeCode} awayCode={awayCode} />
                    </div>
                  )}

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Prediction
                    </div>
                    <p className="mt-1 font-medium">{data.prediction}</p>
                  </div>

                  {data.storylines.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Storylines
                      </div>
                      <ul className="mt-1 space-y-1">
                        {data.storylines.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-[var(--wc-accent)]">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.recap && (
                    <button
                      onClick={() => toggleRecap(data.recap)}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--wc-accent)]/10 py-2 text-sm font-semibold text-[var(--wc-accent)] transition hover:bg-[var(--wc-accent)]/20"
                    >
                      {speaking ? "■ Stop recap" : "🔊 Play 30s recap"}
                    </button>
                  )}

                  <p className="text-[10px] text-slate-400">AI-generated · verify before betting the house.</p>
                </>
              )}

              <button
                onClick={close}
                className="w-full rounded-md border border-slate-300 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OddsBar({
  odds,
  homeCode,
  awayCode,
}: {
  odds: { home: number; draw: number; away: number };
  homeCode: string;
  awayCode: string;
}) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <div className="bg-[var(--wc-accent)]" style={{ width: `${odds.home}%` }} />
        <div className="bg-slate-400" style={{ width: `${odds.draw}%` }} />
        <div className="bg-[var(--wc-accent-2)]" style={{ width: `${odds.away}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums">
        <span className="text-[var(--wc-accent)]">
          {flag(homeCode)} {odds.home}%
        </span>
        <span className="text-slate-400">Draw {odds.draw}%</span>
        <span className="text-[var(--wc-accent-2)]">
          {odds.away}% {flag(awayCode)}
        </span>
      </div>
    </div>
  );
}
