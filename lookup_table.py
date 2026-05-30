"""
lookup_table.py
===============
Maps the eight advancing third-placed teams to their Round-of-32 fixtures.

WHAT IS AUTHORITATIVE HERE vs WHAT IS NOT
-----------------------------------------
* `ROUND_OF_32_SCHEDULE` and `THIRD_PLACE_SLOTS` below are the REAL, published
  2026 fixed bracket (FIFA / Wikipedia knockout schedule, matches 73-88).
  Each third-place slot carries the exact set of groups eligible to fill it.

* The mapping from a specific combination of eight third-placed groups to the
  exact slot assignment is FIFA "Annex C": a table of C(12,8) = 495 rows. That
  full table is NOT reproduced here -- hand-keying 495 official rows from memory
  would be unreliable. Instead this module is DATA-DRIVEN:

    1. If you have the official Annex C, drop it in as JSON and it is used
       verbatim (see `load_annex_c` / `FIFA_KNOCKOUT_MATRIX`).
    2. Otherwise `solve_assignment` computes a VALID assignment by constraint
       satisfaction (each third group -> an eligible slot, perfect matching),
       deterministically. This is structurally correct and same-group-safe for
       all 495 combinations; reconcile against official Annex C where multiple
       valid matchings exist and FIFA's published choice must be matched.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------- #
# REAL fixed Round-of-32 schedule (matches 73-88). "1X" = winner of group X,
# "2X" = runner-up of group X, "3{...}" = best third place from those groups.
# --------------------------------------------------------------------------- #
ROUND_OF_32_SCHEDULE: List[Dict] = [
    {"match": 73, "home": "2A", "away": "2B"},
    {"match": 74, "home": "1E", "away": ("3", {"A", "B", "C", "D", "F"})},
    {"match": 75, "home": "1F", "away": "2C"},
    {"match": 76, "home": "1C", "away": "2F"},
    {"match": 77, "home": "1I", "away": ("3", {"C", "D", "F", "G", "H"})},
    {"match": 78, "home": "2E", "away": "2I"},
    {"match": 79, "home": "1A", "away": ("3", {"C", "E", "F", "H", "I"})},
    {"match": 80, "home": "1L", "away": ("3", {"E", "H", "I", "J", "K"})},
    {"match": 81, "home": "1D", "away": ("3", {"B", "E", "F", "I", "J"})},
    {"match": 82, "home": "1G", "away": ("3", {"A", "E", "H", "I", "J"})},
    {"match": 83, "home": "2K", "away": "2L"},
    {"match": 84, "home": "1H", "away": "2J"},
    {"match": 85, "home": "1B", "away": ("3", {"E", "F", "G", "I", "J"})},
    {"match": 86, "home": "1J", "away": "2H"},
    {"match": 87, "home": "1K", "away": ("3", {"D", "E", "I", "J", "L"})},
    {"match": 88, "home": "2D", "away": "2G"},
]

# The eight slots that must be filled by third-placed teams, with the group
# that hosts each (the winner) and the eligible third-place groups.
THIRD_PLACE_SLOTS: List[Dict] = [
    {"match": m["match"], "winner": m["home"], "eligible": m["away"][1]}
    for m in ROUND_OF_32_SCHEDULE
    if isinstance(m["away"], tuple) and m["away"][0] == "3"
]


# --------------------------------------------------------------------------- #
# Optional official Annex C, loaded from JSON. Format:
#   { "ABCDEFGH": { "74": "C", "77": "D", ... }, ... }   # match-no -> 3rd group
# --------------------------------------------------------------------------- #
FIFA_KNOCKOUT_MATRIX: Dict[str, Dict[int, str]] = {}


def load_annex_c(path: str | Path) -> None:
    """Load the official 495-row Annex C table from JSON into the matrix."""
    raw = json.loads(Path(path).read_text())
    FIFA_KNOCKOUT_MATRIX.clear()
    for key, mapping in raw.items():
        FIFA_KNOCKOUT_MATRIX["".join(sorted(key))] = {int(k): v for k, v in mapping.items()}


def combination_key(third_place_groups: Sequence[str]) -> str:
    """Canonical alphabetical key, e.g. ['E','A','C',...] -> 'AC...E'."""
    if len(third_place_groups) != 8:
        raise ValueError(f"expected 8 third-placed groups, got {len(third_place_groups)}")
    return "".join(sorted(third_place_groups))


# --------------------------------------------------------------------------- #
# Deterministic constraint solver (used when Annex C is not loaded).
# Perfect bipartite matching: third-group -> eligible slot, via augmenting
# paths. Slots and groups are processed in fixed order for reproducibility.
# --------------------------------------------------------------------------- #
def solve_assignment(third_place_groups: Sequence[str]) -> Dict[int, str]:
    """
    Return {match_number: third_place_group} for the 8 third-place slots.
    Raises if no valid same-group-avoiding assignment exists (should never
    happen for a legal set of 8 of the 12 groups).
    """
    groups = sorted(third_place_groups)
    slots = sorted(THIRD_PLACE_SLOTS, key=lambda s: s["match"])

    slot_to_group: Dict[int, str] = {}
    group_to_slot: Dict[str, int] = {}

    def augment(group: str, visited: set[int]) -> bool:
        for slot in slots:
            mno = slot["match"]
            if group not in slot["eligible"] or mno in visited:
                continue
            visited.add(mno)
            occupant = slot_to_group.get(mno)
            if occupant is None or augment(occupant, visited):
                slot_to_group[mno] = group
                group_to_slot[group] = mno
                return True
        return False

    for g in groups:
        if not augment(g, set()):
            raise ValueError(f"no valid Round-of-32 slot for third place group {g}")

    return dict(sorted(slot_to_group.items()))


def assign_third_places(third_place_groups: Sequence[str]) -> Dict[int, str]:
    """
    Resolve the eight third-place slots. Prefer official Annex C if loaded;
    otherwise fall back to the deterministic solver.
    """
    key = combination_key(third_place_groups)
    if key in FIFA_KNOCKOUT_MATRIX:
        return dict(FIFA_KNOCKOUT_MATRIX[key])
    return solve_assignment(third_place_groups)


# Auto-load the official 495-row Annex C if it sits next to this module. Every
# combination is ambiguous (3-214 valid matchings each), so the solver alone
# would NOT reproduce FIFA's published bracket -- the table is required.
_ANNEX_C_PATH = Path(__file__).with_name("annex_c.json")
if _ANNEX_C_PATH.exists():
    load_annex_c(_ANNEX_C_PATH)


# --------------------------------------------------------------------------- #
# Build the resolved Round-of-32 fixture list
# --------------------------------------------------------------------------- #
@dataclass
class Fixture:
    match: int
    home: str   # resolved slot label, e.g. "1E"
    away: str   # resolved slot label, e.g. "3C"

    def __str__(self) -> str:
        return f"Match {self.match}: {self.home} vs {self.away}"


def build_round_of_32(third_place_groups: Sequence[str]) -> List[Fixture]:
    """Produce all 16 Round-of-32 fixtures with third-place slots resolved."""
    assignment = assign_third_places(third_place_groups)
    fixtures: List[Fixture] = []
    for m in ROUND_OF_32_SCHEDULE:
        away = m["away"]
        if isinstance(away, tuple):  # a third-place slot
            grp = assignment[m["match"]]
            away_label = f"3{grp}"
        else:
            away_label = away
        fixtures.append(Fixture(match=m["match"], home=m["home"], away=away_label))
    return fixtures
