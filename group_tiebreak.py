"""
group_tiebreak.py
=================
Computes group standings and resolves multi-team ties using the official
FIFA World Cup tiebreaking procedure, implemented as a recursive
subgroup-isolation engine.

PROCEDURE (see tiebreaker_rules.md for the full prose)
------------------------------------------------------
Teams are first ranked by total POINTS. Any cluster of teams level on points
is resolved as follows:

  STEP 1 - HEAD-TO-HEAD (only matches between the tied teams concerned)
      1a. points in those matches
      1b. goal difference in those matches
      1c. goals scored in those matches
      --> If 1a-1c separate some teams but leave a SMALLER subset still level,
          STEP 1 is RE-APPLIED to that subset only (this is the recursion /
          "loop back to step 1" required by FIFA Art. 13.5(d)).

  STEP 2 - GLOBAL (all group matches) for teams still level after Step 1:
      2a. overall goal difference
      2b. overall goals scored
      2c. team conduct (fair-play) score

  STEP 3 - ULTIMATE DECIDER:
      3.  base FIFA / Coca-Cola World Ranking (unique -> always terminates)

The same comparator engine (minus head-to-head, which is meaningless across
groups) is reused for the cross-group third-place ranking; see
`rank_third_place_teams`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Sequence, Tuple

from teams import Team

# --------------------------------------------------------------------------- #
# Fair-play / conduct scoring (FIFA scheme). Score is a non-positive number;
# closer to zero is better. Tune the weights here without touching the engine.
# --------------------------------------------------------------------------- #
CARD_DEDUCTIONS = {
    "yellow": -1,        # single yellow card
    "second_yellow": -3,  # second yellow (indirect red)
    "direct_red": -4,    # straight red card
    "yellow_and_red": -5,  # yellow followed by a direct red, same player
}


@dataclass(frozen=True)
class Cards:
    """Disciplinary record for one team in one match."""
    yellow: int = 0
    second_yellow: int = 0
    direct_red: int = 0
    yellow_and_red: int = 0

    def conduct_score(self) -> int:
        return (
            self.yellow * CARD_DEDUCTIONS["yellow"]
            + self.second_yellow * CARD_DEDUCTIONS["second_yellow"]
            + self.direct_red * CARD_DEDUCTIONS["direct_red"]
            + self.yellow_and_red * CARD_DEDUCTIONS["yellow_and_red"]
        )


@dataclass(frozen=True)
class Match:
    """A single completed group-stage match."""
    home: str            # team code
    away: str            # team code
    home_goals: int
    away_goals: int
    home_cards: Cards = field(default_factory=Cards)
    away_cards: Cards = field(default_factory=Cards)

    def involves(self, code: str) -> bool:
        return code in (self.home, self.away)

    def is_between(self, codes: set[str]) -> bool:
        return self.home in codes and self.away in codes


@dataclass
class TeamRecord:
    """Accumulated group-stage statistics for one team."""
    team: Team
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    gf: int = 0          # goals for
    ga: int = 0          # goals against
    conduct: float = 0.0  # fair-play score (<= 0, closer to 0 is better)

    @property
    def points(self) -> int:
        return self.won * 3 + self.drawn

    @property
    def gd(self) -> int:
        return self.gf - self.ga

    @property
    def code(self) -> str:
        return self.team.code


# --------------------------------------------------------------------------- #
# Stat accumulation
# --------------------------------------------------------------------------- #
def _accumulate(records: Dict[str, TeamRecord], matches: Sequence[Match]) -> None:
    """Fold a set of matches into the given records (used both globally and H2H)."""
    for m in matches:
        h, a = records[m.home], records[m.away]
        h.played += 1
        a.played += 1
        h.gf += m.home_goals
        h.ga += m.away_goals
        a.gf += m.away_goals
        a.ga += m.home_goals
        h.conduct += m.home_cards.conduct_score()
        a.conduct += m.away_cards.conduct_score()
        if m.home_goals > m.away_goals:
            h.won += 1
            a.lost += 1
        elif m.home_goals < m.away_goals:
            a.won += 1
            h.lost += 1
        else:
            h.drawn += 1
            a.drawn += 1


def build_records(teams: Sequence[Team], matches: Sequence[Match]) -> Dict[str, TeamRecord]:
    """Full-group records keyed by team code.

    Conduct is seeded with each team's historical fair-play prior
    (`Team.fair_play_avg`); any explicit per-match cards then add on top. In the
    score-only simulator no cards are entered, so conduct stays equal to the
    prior -- giving the fair-play tiebreaker (Step 2c) a meaningful value.
    """
    records = {t.code: TeamRecord(team=t, conduct=t.fair_play_avg) for t in teams}
    relevant = [m for m in matches if m.home in records and m.away in records]
    _accumulate(records, relevant)
    return records


def _h2h_records(codes: Sequence[str], full: Dict[str, TeamRecord],
                 matches: Sequence[Match]) -> Dict[str, TeamRecord]:
    """Fresh records counting ONLY matches played between the given codes."""
    code_set = set(codes)
    sub = {c: TeamRecord(team=full[c].team) for c in codes}
    _accumulate(sub, [m for m in matches if m.is_between(code_set)])
    return sub


# --------------------------------------------------------------------------- #
# Generic "sort then partition into still-tied buckets" helper
# --------------------------------------------------------------------------- #
def _bucket_by_key(codes: Sequence[str],
                   key: Callable[[str], tuple]) -> List[List[str]]:
    """Sort codes by key (descending) and group consecutive equal keys."""
    ordered = sorted(codes, key=key, reverse=True)
    buckets: List[List[str]] = []
    for c in ordered:
        if buckets and key(buckets[-1][0]) == key(c):
            buckets[-1].append(c)
        else:
            buckets.append([c])
    return buckets


# --------------------------------------------------------------------------- #
# STEP 1 - recursive head-to-head
# --------------------------------------------------------------------------- #
def _resolve_head_to_head(codes: List[str], full: Dict[str, TeamRecord],
                          matches: Sequence[Match]) -> List[List[str]]:
    """
    Returns an ordered list of 'blocks'. Each block is a list of codes that
    remain tied after head-to-head criteria (1a-1c) have been exhausted,
    including re-application to any separated subset.
    """
    if len(codes) == 1:
        return [codes]

    h2h = _h2h_records(codes, full, matches)
    key = lambda c: (h2h[c].points, h2h[c].gd, h2h[c].gf)
    buckets = _bucket_by_key(codes, key)

    if len(buckets) == 1:
        # No separation possible via head-to-head for this set.
        return [list(codes)]

    # Separation occurred -> re-apply Step 1 to each (strictly smaller) bucket.
    blocks: List[List[str]] = []
    for bucket in buckets:
        blocks.extend(_resolve_head_to_head(bucket, full, matches))
    return blocks


# --------------------------------------------------------------------------- #
# STEP 2 + STEP 3 - global metrics then FIFA ranking (always terminates)
# --------------------------------------------------------------------------- #
def _resolve_global(codes: List[str], full: Dict[str, TeamRecord]) -> List[str]:
    # fifa_rank is unique and lower-is-better, so negate it to keep "higher key
    # wins" semantics; this guarantees a strict total order -> full resolution.
    key = lambda c: (
        full[c].gd,                 # 2a overall goal difference
        full[c].gf,                 # 2b overall goals scored
        full[c].conduct,            # 2c conduct / fair-play score
        -full[c].team.fifa_rank,    # 3  FIFA ranking (ultimate decider)
    )
    return sorted(codes, key=key, reverse=True)


# --------------------------------------------------------------------------- #
# Tie resolution for a single cluster of teams level on POINTS
# --------------------------------------------------------------------------- #
def _break_tie(codes: List[str], full: Dict[str, TeamRecord],
               matches: Sequence[Match]) -> List[str]:
    ordered: List[str] = []
    for block in _resolve_head_to_head(codes, full, matches):
        if len(block) == 1:
            ordered.extend(block)
        else:
            ordered.extend(_resolve_global(block, full))
    return ordered


# --------------------------------------------------------------------------- #
# Public API: full group standings
# --------------------------------------------------------------------------- #
@dataclass
class StandingRow:
    rank: int
    record: TeamRecord

    def __str__(self) -> str:
        r = self.record
        return (f"{self.rank}. {r.team.name:<24} "
                f"P{r.played} W{r.won} D{r.drawn} L{r.lost} "
                f"GF{r.gf} GA{r.ga} GD{r.gd:+d} Pts{r.points} "
                f"Fair{r.conduct:+.2f}")


def calculate_standings(teams: Sequence[Team],
                        matches: Sequence[Match]) -> List[StandingRow]:
    """
    Rank a group's teams 1..N applying points, then the full FIFA tiebreaker
    cascade to any teams level on points.
    """
    records = build_records(teams, matches)
    # First split by points, best first.
    by_points = _bucket_by_key([t.code for t in teams],
                               key=lambda c: (records[c].points,))
    final_order: List[str] = []
    for cluster in by_points:
        if len(cluster) == 1:
            final_order.extend(cluster)
        else:
            final_order.extend(_break_tie(cluster, records, matches))

    return [StandingRow(rank=i + 1, record=records[c])
            for i, c in enumerate(final_order)]


class GroupSimulator:
    """Thin convenience wrapper around calculate_standings for one group."""

    def __init__(self, group_id: str, teams: Sequence[Team]):
        self.group_id = group_id
        self.teams = list(teams)
        self.matches: List[Match] = []

    def add_match(self, match: Match) -> "GroupSimulator":
        self.matches.append(match)
        return self

    def add_matches(self, matches: Sequence[Match]) -> "GroupSimulator":
        self.matches.extend(matches)
        return self

    def standings(self) -> List[StandingRow]:
        return calculate_standings(self.teams, self.matches)

    def winner(self) -> TeamRecord:
        return self.standings()[0].record

    def runner_up(self) -> TeamRecord:
        return self.standings()[1].record

    def third_place(self) -> TeamRecord:
        return self.standings()[2].record


# --------------------------------------------------------------------------- #
# B. Cross-group third-place comparator
# --------------------------------------------------------------------------- #
def rank_third_place_teams(third_records: Sequence[TeamRecord]) -> List[TeamRecord]:
    """
    Rank the 12 third-placed teams globally. Head-to-head is NOT used here
    (teams come from different groups), per FIFA Art. 13. Order:
        1. points  2. goal difference  3. goals scored
        4. conduct 5. FIFA ranking (ultimate decider)
    """
    key = lambda r: (r.points, r.gd, r.gf, r.conduct, -r.team.fifa_rank)
    return sorted(third_records, key=key, reverse=True)
