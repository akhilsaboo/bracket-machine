"""
main.py
=======
Wrapper / orchestration layer. Shows how teams.py, group_tiebreak.py and
lookup_table.py talk to each other to output the definitive Round-of-32 bracket.

Run:  python main.py
"""

from __future__ import annotations

import random
from typing import Dict, List, Sequence

from teams import Team, TeamRegistry, default_registry, GROUP_IDS
from group_tiebreak import (
    Cards, Match, GroupSimulator, StandingRow, TeamRecord,
    rank_third_place_teams,
)
from lookup_table import build_round_of_32, combination_key


class WorldCupEngine:
    """Drives the full group stage -> Round-of-32 pipeline."""

    def __init__(self, registry: TeamRegistry):
        self.registry = registry
        self.matches: Dict[str, List[Match]] = {g: [] for g in GROUP_IDS}

    def add_group_matches(self, group_id: str, matches: Sequence[Match]) -> None:
        self.matches[group_id].extend(matches)

    def group_standings(self) -> Dict[str, List[StandingRow]]:
        out: Dict[str, List[StandingRow]] = {}
        for gid in GROUP_IDS:
            sim = GroupSimulator(gid, self.registry.group(gid))
            sim.add_matches(self.matches[gid])
            out[gid] = sim.standings()
        return out

    def resolve_round_of_32(self):
        standings = self.group_standings()

        winners = {gid: rows[0].record for gid, rows in standings.items()}
        runners = {gid: rows[1].record for gid, rows in standings.items()}
        thirds = {gid: rows[2].record for gid, rows in standings.items()}

        # B. Rank the 12 third-placed teams; top 8 advance.
        ranked_thirds = rank_third_place_teams(list(thirds.values()))
        advancing = ranked_thirds[:8]
        advancing_groups = [r.team.group for r in advancing]

        # C. Resolve the bracket.
        fixtures = build_round_of_32(advancing_groups)

        return {
            "standings": standings,
            "winners": winners,
            "runners": runners,
            "ranked_thirds": ranked_thirds,
            "advancing_groups": advancing_groups,
            "combination_key": combination_key(advancing_groups),
            "fixtures": fixtures,
        }


# =========================================================================== #
# DEMO 1 -- the user's complex 3-way tie (Panama / USA / Mexico / Canada)
# =========================================================================== #
def demo_three_way_tie() -> None:
    print("=" * 70)
    print("DEMO 1: 3-way tie breakup (Panama sweeps; USA/MEX/CAN tied on pts)")
    print("=" * 70)

    teams = [
        Team("PAN", "Panama", "A", fifa_rank=40),
        Team("USA", "USA", "A", fifa_rank=16),
        Team("MEX", "Mexico", "A", fifa_rank=14),
        Team("CAN", "Canada", "A", fifa_rank=30),
    ]
    sim = GroupSimulator("A", teams)
    sim.add_matches([
        Match("PAN", "USA", 1, 0),
        Match("PAN", "MEX", 1, 0),
        Match("PAN", "CAN", 1, 0),
        Match("USA", "CAN", 4, 1),
        Match("MEX", "USA", 3, 1),
        Match("MEX", "CAN", 1, 0),
    ])
    for row in sim.standings():
        print(" ", row)
    print("""
  Walkthrough:
    Panama = 9 pts, clear 1st. USA / MEX / CAN all on 6 pts -> tie cluster.
    Step 1 H2H points among the three: all = 3  -> still level.
    Step 1 H2H goal diff: MEX +3, USA +1, CAN -4  -> CAN separates (3rd of cluster).
    Re-apply Step 1 to {USA, MEX} only: their single match was MEX 3-1 USA,
    so MEX has 3 H2H pts, USA 0  -> MEX above USA. CAN never re-enters.
    Result: Panama, Mexico, USA, Canada.
""")


# =========================================================================== #
# DEMO 2 -- forced draw variant (escalates to global metrics)
# =========================================================================== #
def demo_escalation() -> None:
    print("=" * 70)
    print("DEMO 2: USA vs MEX drawn -> H2H exhausted -> global metrics decide")
    print("=" * 70)

    teams = [
        Team("PAN", "Panama", "A", fifa_rank=40),
        Team("USA", "USA", "A", fifa_rank=16),
        Team("MEX", "Mexico", "A", fifa_rank=14),
        Team("CAN", "Canada", "A", fifa_rank=30),
    ]
    sim = GroupSimulator("A", teams)
    sim.add_matches([
        Match("PAN", "USA", 1, 0),
        Match("PAN", "MEX", 1, 0),
        Match("PAN", "CAN", 1, 0),
        Match("USA", "CAN", 4, 1),
        Match("MEX", "USA", 1, 1),   # now a draw
        Match("MEX", "CAN", 4, 1),   # MEX matches USA's global numbers except GF
    ])
    for row in sim.standings():
        print(" ", row)
    print("""
  After CAN is dropped on H2H goal diff, {USA, MEX} are level on H2H pts/GD/GF
  (the 1-1 draw), so Step 1 is exhausted. Step 2 now uses GLOBAL numbers, where
  Canada's results re-enter the picture via overall GD / goals scored.
""")


# =========================================================================== #
# DEMO 3 -- full 12-group tournament -> Round of 32 bracket
# =========================================================================== #
def _round_robin(group_id: str, codes: List[str], rng: random.Random) -> List[Match]:
    matches: List[Match] = []
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            hg, ag = rng.randint(0, 4), rng.randint(0, 4)
            matches.append(Match(
                codes[i], codes[j], hg, ag,
                home_cards=Cards(yellow=rng.randint(0, 3)),
                away_cards=Cards(yellow=rng.randint(0, 3)),
            ))
    return matches


def demo_full_tournament(seed: int = 2026) -> None:
    print("=" * 70)
    print("DEMO 3: full 12-group simulation -> definitive Round of 32")
    print("=" * 70)

    rng = random.Random(seed)
    registry = default_registry()
    engine = WorldCupEngine(registry)

    for gid in GROUP_IDS:
        codes = [t.code for t in registry.group(gid)]
        engine.add_group_matches(gid, _round_robin(gid, codes, rng))

    result = engine.resolve_round_of_32()

    print("\nThird-place ranking (top 8 advance):")
    for i, rec in enumerate(result["ranked_thirds"], 1):
        flag = "  <-- ADVANCES" if i <= 8 else ""
        print(f"  {i:>2}. Grp {rec.team.group}  {rec.team.name:<22} "
              f"Pts{rec.points} GD{rec.gd:+d} GF{rec.gf} Fair{rec.conduct}{flag}")

    print(f"\nAdvancing third-place groups: {sorted(result['advancing_groups'])}")
    print(f"Annex C combination key:     {result['combination_key']}")

    print("\nDefinitive Round of 32 bracket:")
    for fx in result["fixtures"]:
        print(f"  {fx}")


if __name__ == "__main__":
    demo_three_way_tie()
    demo_escalation()
    demo_full_tournament()
