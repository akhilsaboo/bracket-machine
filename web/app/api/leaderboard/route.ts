import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SCHEDULE, type Fixture } from "@/lib/data";
import { scoreEverything, scoreSecondChance, type Boosts } from "@/lib/scoring";
import { allGroupsComplete, round32, type ResolvedFixture } from "@/lib/compute";
import type { GroupResult, TournamentTruth } from "@/lib/results";
import type { KnockoutWinners, Predictions } from "@/lib/predictions";

// Two global boards share this route: the main "global" board (normal brackets,
// full group+KO scoring) and the "global_sc" board (second-chance brackets,
// knockout-only, scored from the real R32 + Double-or-Nothing stakes). Pick with
// ?board=sc; each gets its own cached snapshot row.
type Board = "global" | "sc";
const SNAPSHOT_KEY: Record<Board, string> = { global: "global", sc: "global_sc" };
const BRACKET_KIND: Record<Board, string> = { global: "normal", sc: "second_chance" };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Overall (all-users) leaderboard. Scoring every bracket is too heavy to do per
// page-load, so we cache a precomputed snapshot in `leaderboard_snapshot` and only
// recompute when it's older than the TTL. Clients hit this route; the small JSON
// snapshot is all that crosses the wire. Pre-tournament (no results yet) we skip
// the bracket scan entirely — everyone is tied at 0 anyway.
// Recompute at most once per TTL once results exist. Each recompute reads every
// submitted bracket, so this TTL is the main lever on Supabase egress at scale —
// raise LEADERBOARD_TTL_MS (e.g. to 30–60 min) if egress gets tight. Default 15 min.
const STALE_MS = Number(process.env.LEADERBOARD_TTL_MS) || 15 * 60 * 1000;
// How many ranked rows to ship in the snapshot. The board is fully scrollable, so
// this is just a payload cap — at the current field everyone fits. If the field
// ever dwarfs this, switch to server-side pagination (see project memory).
const MAX_ROWS = 500;
const PAGE = 1000; // PostgREST max rows per request

interface Row {
  rank: number;
  user_id: string;
  bracket_id: string;
  display_name: string;
  bracket_name: string;
  points: number;
  group: number;
  ko: number;
  exact: number;
}
interface Snapshot {
  rows: Row[];
  totalEntries: number;
  hasResults: boolean;
  updatedAt: string;
  // Every entry's score, sorted ascending — the global distribution used to compute
  // ESPN-style percentiles on both this board and pool boards. Empty pre-results.
  scores: number[];
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

// Best-effort, per-instance guard so one server doesn't run several scans of the
// same board at once.
const computing = new Set<Board>();

async function fetchTruth(origin: string): Promise<TournamentTruth | null> {
  try {
    const r = await fetch(`${origin}/api/results`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as {
      groupResults?: Record<string, GroupResult>;
      knockoutWinners?: Record<number, string>;
    };
    return { groupResults: d.groupResults ?? {}, knockoutWinners: d.knockoutWinners ?? {} };
  } catch {
    return null;
  }
}

interface BracketRow {
  id: string;
  user_id: string;
  name: string;
  predictions: Predictions;
  knockout: KnockoutWinners;
  boosts?: Boosts | null;
}

/** Page through every bracket of the given kind. Each bracket is its own
 *  leaderboard entry — a user with several brackets appears multiple times
 *  (ESPN-style). Includes unsubmitted "predict as you go" brackets; empty ones
 *  score 0. `boosts` is read for the second-chance board's Double-or-Nothing. */
async function readAllEntries(sb: SupabaseClient, kind: string): Promise<BracketRow[]> {
  const out: BracketRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("brackets")
      .select("id, user_id, name, predictions, knockout, boosts")
      .eq("kind", kind)
      .is("deleted_at", null)
      // Every (non-deleted) normal bracket is an entry — incl. unsubmitted "predict
      // as you go" brackets people compete with in pools. Empty drafts score 0.
      .order("user_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as BracketRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function readNames(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data } = await sb.from("profiles").select("id, display_name").in("id", slice);
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name ?? "Anonymous");
    }
  }
  return names;
}

/** The REAL Round of 32 from the live group truth — same derivation the client's
 *  live feed uses (round32 over the actual group scorelines). Null until all 12
 *  groups are decided. Seeds second-chance scoring. */
function realR32(truth: TournamentTruth): ResolvedFixture[] | null {
  const preds: Predictions = {};
  for (const [id, r] of Object.entries(truth.groupResults)) {
    preds[id] = { home: r.homeGoals, away: r.awayGoals };
  }
  return allGroupsComplete(preds) ? round32(preds) : null;
}

async function compute(sb: SupabaseClient, origin: string, board: Board): Promise<Snapshot> {
  const truth = await fetchTruth(origin);
  const kind = BRACKET_KIND[board];

  // Second-chance entries only score once the real R32 exists AND knockout games
  // have started; the main board scores as soon as any real result is in.
  const r32 = board === "sc" && truth ? realR32(truth) : null;
  const hasResults =
    board === "sc"
      ? !!truth && !!r32 && Object.keys(truth.knockoutWinners).length > 0
      : !!truth &&
        (Object.keys(truth.groupResults).length > 0 || Object.keys(truth.knockoutWinners).length > 0);

  // Cheap "how many have entered" count — never pulls bracket bodies.
  const { count } = await sb
    .from("brackets")
    .select("user_id", { count: "exact", head: true })
    .eq("kind", kind)
    .is("deleted_at", null);

  if (!truth || !hasResults) {
    return { rows: [], totalEntries: count ?? 0, hasResults: false, updatedAt: new Date().toISOString(), scores: [] };
  }

  const entries = await readAllEntries(sb, kind);
  const fixtures: Fixture[] = SCHEDULE;
  const resultFor = (f: Fixture): GroupResult | null => truth.groupResults[f.id] ?? null;

  // One row per bracket — multiple submitted brackets from the same user each get
  // their own entry on the board.
  const names = await readNames(sb, [...new Set(entries.map((e) => e.user_id))]);
  const scored = entries.map((b) => {
    if (board === "sc") {
      // Knockout-only, resolved from the real R32, Double-or-Nothing applied.
      const s = scoreSecondChance(b.knockout, r32, truth, b.boosts);
      return {
        user_id: b.user_id,
        bracket_id: b.id,
        display_name: names.get(b.user_id) ?? "Anonymous",
        bracket_name: b.name || "Second Chance",
        points: s.points,
        group: 0,
        ko: s.points,
        exact: s.exact,
      };
    }
    const s = scoreEverything(b.predictions, b.knockout, fixtures, resultFor, truth);
    return {
      user_id: b.user_id,
      bracket_id: b.id,
      display_name: names.get(b.user_id) ?? "Anonymous",
      bracket_name: b.name || "Bracket",
      points: s.total,
      group: s.group.points,
      ko: s.ko.points,
      exact: s.group.exact,
    };
  });
  scored.sort(
    (a, b) =>
      b.points - a.points ||
      b.ko - a.ko ||
      b.exact - a.exact ||
      a.display_name.localeCompare(b.display_name) ||
      a.bracket_name.localeCompare(b.bracket_name),
  );

  const rows: Row[] = scored.slice(0, MAX_ROWS).map((r, i) => ({ rank: i + 1, ...r }));
  // Full score distribution (ascending) so clients can rank any score — the top-N
  // rows here AND each pool member's score — into the same global percentile.
  const scores = scored.map((r) => r.points).sort((a, b) => a - b);
  return { rows, totalEntries: entries.length, hasResults: true, updatedAt: new Date().toISOString(), scores };
}

export async function GET(req: Request) {
  const sb = admin();
  if (!sb) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }
  const url = new URL(req.url);
  const origin = url.origin;
  const board: Board = url.searchParams.get("board") === "sc" ? "sc" : "global";
  const snapshotKey = SNAPSHOT_KEY[board];
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  const force =
    url.searchParams.get("force") === "1" &&
    !!adminSecret &&
    req.headers.get("authorization") === `Bearer ${adminSecret}`;

  const { data: snapRow } = await sb
    .from("leaderboard_snapshot")
    .select("payload, updated_at")
    .eq("key", snapshotKey)
    .maybeSingle();
  const cached = (snapRow?.payload as Snapshot | undefined) ?? null;
  const ageMs = snapRow ? Date.now() - new Date(snapRow.updated_at as string).getTime() : Infinity;

  if (!force && cached && ageMs < STALE_MS) {
    return Response.json(cached, { headers: { "cache-control": "no-store" } });
  }
  // Another request on this instance is already recomputing this board — serve
  // what we have.
  if (computing.has(board) && cached) {
    return Response.json(cached, { headers: { "cache-control": "no-store" } });
  }

  computing.add(board);
  try {
    const snap = await compute(sb, origin, board);
    await sb
      .from("leaderboard_snapshot")
      .upsert({ key: snapshotKey, payload: snap, updated_at: snap.updatedAt }, { onConflict: "key" });
    return Response.json(snap, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (cached) return Response.json(cached, { headers: { "cache-control": "no-store" } });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    computing.delete(board);
  }
}
