"""
teams.py
========
Storage and retrieval of the 48 FIFA World Cup 2026 teams, their group
assignments (Groups A-L), their base FIFA / Coca-Cola World Ranking, and their
historical fair-play prior.

Data is loaded from `teams.csv` (the authoritative, scrape-friendly source of
team identity / group / ranking) and `fair_play.json` (the per-team historical
fair-play average used as the conduct tiebreaker). Both files sit next to this
module. The registry is intentionally data-driven so the CSV can be refreshed
from a live feed without touching the tiebreaker engine.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

GROUP_IDS: List[str] = list("ABCDEFGHIJKL")  # 12 groups, 4 teams each

_TEAMS_CSV = Path(__file__).with_name("teams.csv")
_FAIR_PLAY_JSON = Path(__file__).with_name("fair_play.json")


@dataclass(frozen=True)
class Team:
    """An immutable team identity. Stats are computed elsewhere, never here."""
    code: str          # unique short code, e.g. "MEX"
    name: str          # display name
    group: str         # one of GROUP_IDS
    fifa_rank: int      # official ranking position; LOWER is better (1 = best)
    fair_play_avg: float = 0.0  # historical avg group-stage fair-play points (<=0)

    def __post_init__(self) -> None:
        if self.group not in GROUP_IDS:
            raise ValueError(f"{self.code}: invalid group {self.group!r}")
        if self.fifa_rank < 1:
            raise ValueError(f"{self.code}: fifa_rank must be >= 1")


# --------------------------------------------------------------------------- #
# Data loading
# --------------------------------------------------------------------------- #
def _load_fair_play() -> Dict[str, float]:
    """Per-team historical fair-play prior, keyed by team code. Empty if absent."""
    if not _FAIR_PLAY_JSON.exists():
        return {}
    raw = json.loads(_FAIR_PLAY_JSON.read_text())
    return {code: float(v) for code, v in raw.get("teams", raw).items()}


def _load_teams_from_csv(path: Path = _TEAMS_CSV) -> Dict[str, Team]:
    fair_play = _load_fair_play()
    teams: Dict[str, Team] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            code = row["fifa_code"].strip()
            teams[code] = Team(
                code=code,
                name=row["team_name"].strip(),
                group=row["group_letter"].strip(),
                fifa_rank=int(row["fifa_rank"]),
                fair_play_avg=fair_play.get(code, 0.0),
            )
    return teams


class TeamRegistry:
    """Lightweight container with the lookups the rest of the system needs."""

    def __init__(self, teams: Iterable[Team] | None = None) -> None:
        source = list(teams) if teams is not None else list(_load_teams_from_csv().values())
        self._by_code: Dict[str, Team] = {}
        for t in source:
            if t.code in self._by_code:
                raise ValueError(f"duplicate team code {t.code!r}")
            self._by_code[t.code] = t
        self._validate()

    def _validate(self) -> None:
        counts: Dict[str, int] = {g: 0 for g in GROUP_IDS}
        for t in self._by_code.values():
            counts[t.group] += 1
        bad = {g: c for g, c in counts.items() if c != 4}
        if bad:
            raise ValueError(f"each group needs exactly 4 teams; got {bad}")

    def get(self, code: str) -> Team:
        return self._by_code[code]

    def all(self) -> List[Team]:
        return list(self._by_code.values())

    def group(self, gid: str) -> List[Team]:
        return [t for t in self._by_code.values() if t.group == gid]

    def groups(self) -> Dict[str, List[Team]]:
        return {g: self.group(g) for g in GROUP_IDS}


def default_registry() -> TeamRegistry:
    """Convenience factory used by the demo / wrapper."""
    return TeamRegistry()
