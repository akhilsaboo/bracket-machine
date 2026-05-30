import { kickoffAt, type Fixture } from "@/lib/data";

const MATCH_MS = 110 * 60 * 1000; // ~ full match incl. stoppage/half-time

/** Kickoff has passed — the pick is locked. */
export function isLocked(f: Fixture, now: Date): boolean {
  const k = kickoffAt(f);
  return !!k && now.getTime() >= k.getTime();
}

/** Match is finished — move to the bottom and red it out. */
export function isOver(f: Fixture, now: Date): boolean {
  const k = kickoffAt(f);
  return !!k && now.getTime() >= k.getTime() + MATCH_MS;
}

/** Whether the fixtures carry real date/time data yet. */
export function hasSchedule(fixtures: Fixture[]): boolean {
  return fixtures.some((f) => f.date || f.kickoffUTC || f.kickoff);
}

export function dayKey(f: Fixture): string {
  if (f.date) return f.date;
  const k = kickoffAt(f);
  return k ? k.toISOString().slice(0, 10) : "TBD";
}

export function dayLabel(key: string): string {
  if (key === "TBD") return "Date TBD";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function timeLabel(f: Fixture): string {
  if (f.localTime) return f.tzAbbrev ? `${f.localTime} ${f.tzAbbrev}` : f.localTime;
  const k = kickoffAt(f);
  return k ? k.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}

function kickoffMs(f: Fixture): number {
  const k = kickoffAt(f);
  return k ? k.getTime() : Number.MAX_SAFE_INTEGER; // undated → sort last among upcoming
}

export interface ScheduleSplit {
  /** Upcoming/live matches, grouped by day in chronological order. */
  days: { key: string; label: string; fixtures: Fixture[] }[];
  /** Finished matches, most recent first, to render redded at the bottom. */
  over: Fixture[];
}

export function splitSchedule(fixtures: Fixture[], now: Date): ScheduleSplit {
  const upcoming: Fixture[] = [];
  const over: Fixture[] = [];
  for (const f of fixtures) (isOver(f, now) ? over : upcoming).push(f);

  upcoming.sort((a, b) => kickoffMs(a) - kickoffMs(b));
  over.sort((a, b) => kickoffMs(b) - kickoffMs(a));

  const days: ScheduleSplit["days"] = [];
  for (const f of upcoming) {
    const key = dayKey(f);
    const last = days[days.length - 1];
    if (last && last.key === key) last.fixtures.push(f);
    else days.push({ key, label: dayLabel(key), fixtures: [f] });
  }
  return { days, over };
}
