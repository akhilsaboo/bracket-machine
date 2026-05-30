import type { Team } from "@/lib/engine";
import teamsJson from "@/data/teams.json";
import scheduleJson from "@/data/schedule.json";

export type { Team };

export interface Fixture {
  id: string;
  stage: string;
  group: string;
  matchday: number;
  home: string; // team code
  away: string; // team code
  // Real-schedule fields (optional until the data pull lands):
  no?: number; // FIFA match number
  date?: string | null; // local calendar date "YYYY-MM-DD"
  kickoffUTC?: string | null; // absolute instant, ISO 8601
  localTime?: string | null; // local kickoff "HH:MM"
  tzAbbrev?: string | null; // e.g. "ET"
  venue?: string | null;
  city?: string | null;
  // legacy field retained for back-compat with older data files:
  kickoff?: string | null;
}

/** Absolute kickoff instant, or null if the schedule data hasn't been filled yet. */
export function kickoffAt(f: Fixture): Date | null {
  const iso = f.kickoffUTC ?? f.kickoff ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const TEAMS = teamsJson as Team[];
export const SCHEDULE = scheduleJson as Fixture[];

export const TEAM_BY_CODE: Map<string, Team> = new Map(TEAMS.map((t) => [t.code, t]));
export const GROUP_IDS: string[] = [...new Set(TEAMS.map((t) => t.group))].sort();

export const teamsInGroup = (g: string): Team[] => TEAMS.filter((t) => t.group === g);
export const groupFixtures = (g: string): Fixture[] => SCHEDULE.filter((f) => f.group === g);
export const team = (code: string): Team | undefined => TEAM_BY_CODE.get(code);
