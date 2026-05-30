"""
build_fair_play.py
==================
Turns the auditable raw card-count file (`fair_play_raw.csv`) into the per-team
historical fair-play prior consumed by teams.py (`fair_play.json`).

Methodology (matches the user's spec):
  * For each historical team, convert its group-stage cards in each tournament to
    FIFA fair-play points (yellow -1, second yellow -3, direct red -4,
    yellow+red -5), then AVERAGE across the tournaments it appears in.
  * Compute the all-team average over every team present in the raw data.
  * Emit a prior for ALL 48 teams in teams.csv: a team that competed before gets
    its own average; a newcomer (or any team absent from the raw data) gets the
    all-team average -- exactly "average it for returners, overall average for the
    rest".

Run:  python build_fair_play.py    # rewrites fair_play.json
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Dict, List

HERE = Path(__file__).parent
RAW = HERE / "fair_play_raw.csv"
TEAMS = HERE / "teams.csv"
OUT = HERE / "fair_play.json"

POINTS = {"yellows": -1, "second_yellows": -3, "direct_reds": -4, "yellow_and_red": -5}

# Maps a historical team's canonical name (as written in fair_play_raw.csv) to its
# 2026 FIFA code, so its prior attaches to the right 2026 entry. Names not in 2026
# (e.g. teams that didn't qualify) still count toward the all-team average.
NAME_TO_2026_CODE = {
    "Mexico": "MEX", "South Africa": "RSA", "South Korea": "KOR", "Czechia": "CZE",
    "Canada": "CAN", "Bosnia & Herzegovina": "BIH", "Qatar": "QAT", "Switzerland": "SUI",
    "Brazil": "BRA", "Morocco": "MAR", "Haiti": "HAI", "Scotland": "SCO",
    "USA": "USA", "Paraguay": "PAR", "Australia": "AUS", "Türkiye": "TUR",
    "Germany": "GER", "Curaçao": "CUR", "Côte d'Ivoire": "CIV", "Ecuador": "ECU",
    "Netherlands": "NED", "Japan": "JPN", "Sweden": "SWE", "Tunisia": "TUN",
    "Belgium": "BEL", "Egypt": "EGY", "Iran": "IRN", "New Zealand": "NZL",
    "Spain": "ESP", "Cabo Verde": "CPV", "Saudi Arabia": "KSA", "Uruguay": "URU",
    "France": "FRA", "Senegal": "SEN", "Norway": "NOR", "Iraq": "IRQ",
    "Argentina": "ARG", "Algeria": "ALG", "Austria": "AUT", "Jordan": "JOR",
    "Portugal": "POR", "DR Congo": "COD", "Uzbekistan": "UZB", "Colombia": "COL",
    "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN",
}


def _fair_play_points(row: Dict[str, str]) -> int:
    return sum(POINTS[col] * int(row[col]) for col in POINTS)


def _read_raw() -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with RAW.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(r for r in fh if not r.lstrip().startswith("#"))
        for row in reader:
            rows.append(row)
    return rows


def build() -> Dict:
    raw = _read_raw()

    # team -> list of per-tournament fair-play points
    per_team: Dict[str, List[int]] = {}
    for row in raw:
        per_team.setdefault(row["team"], []).append(_fair_play_points(row))

    team_avg = {t: sum(v) / len(v) for t, v in per_team.items()}
    all_team_avg = round(sum(team_avg.values()) / len(team_avg), 4) if team_avg else 0.0

    # Map historical averages onto 2026 codes; fill the rest with the all-team avg.
    codes_2026 = [r["fifa_code"] for r in csv.DictReader(TEAMS.open(encoding="utf-8"))]
    priors: Dict[str, float] = {}
    for code in codes_2026:
        name = next((n for n, c in NAME_TO_2026_CODE.items() if c == code), None)
        if name and name in team_avg:
            priors[code] = round(team_avg[name], 4)
        else:
            priors[code] = all_team_avg

    return {
        "_methodology": "FIFA group-stage fair-play points (Y -1, 2Y -3, DR -4, Y+R -5), "
                        "averaged per team across 2018/2022; newcomers/missing get all_team_avg.",
        "all_team_avg": all_team_avg,
        "teams_with_history": sorted(NAME_TO_2026_CODE[n] for n in team_avg if n in NAME_TO_2026_CODE),
        "teams": priors,
    }


if __name__ == "__main__":
    data = build()
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    n_hist = len(data["teams_with_history"])
    print(f"Wrote {OUT.name}: 48 priors, all_team_avg={data['all_team_avg']}, "
          f"{n_hist} team(s) with verified history: {data['teams_with_history']}")
