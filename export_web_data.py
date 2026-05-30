"""
export_web_data.py
==================
Exports the verified Python engine's data + golden test vectors into the web app
(`web/data/`). The golden vectors let the TypeScript port be validated to match
the Python engine bit-for-bit (standings order, third-place ranking, R32 bracket).

Run:  python export_web_data.py
"""

from __future__ import annotations

import csv
import json
import random
from pathlib import Path
from typing import Dict, List

from teams import default_registry, GROUP_IDS, Team
from group_tiebreak import Cards, Match, GroupSimulator, rank_third_place_teams
from lookup_table import build_round_of_32

HERE = Path(__file__).parent
OUT = HERE / "web" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def export_teams() -> None:
    reg = default_registry()
    teams = [
        {"code": t.code, "name": t.name, "group": t.group,
         "fifaRank": t.fifa_rank, "fairPlayAvg": t.fair_play_avg}
        for t in sorted(reg.all(), key=lambda x: (x.group, -x.fifa_rank))
    ]
    (OUT / "teams.json").write_text(json.dumps(teams, ensure_ascii=False, indent=2))
    print(f"  teams.json: {len(teams)} teams")


def copy_annex_c() -> None:
    src = json.loads((HERE / "annex_c.json").read_text())
    (OUT / "annexC.json").write_text(json.dumps(src, indent=0))
    print(f"  annexC.json: {len(src)} combinations")


def _match_to_dict(m: Match) -> Dict:
    def cards(c: Cards) -> Dict:
        return {"yellow": c.yellow, "secondYellow": c.second_yellow,
                "directRed": c.direct_red, "yellowAndRed": c.yellow_and_red}
    return {"home": m.home, "away": m.away, "homeGoals": m.home_goals,
            "awayGoals": m.away_goals, "homeCards": cards(m.home_cards),
            "awayCards": cards(m.away_cards)}


def _round_robin(codes: List[str], rng: random.Random) -> List[Match]:
    out: List[Match] = []
    for i in range(len(codes)):
        for j in range(i + 1, len(codes)):
            out.append(Match(
                codes[i], codes[j], rng.randint(0, 4), rng.randint(0, 4),
                home_cards=Cards(yellow=rng.randint(0, 3)),
                away_cards=Cards(yellow=rng.randint(0, 3)),
            ))
    return out


def _to_utc(date: str, local_time: str, utc_offset: str) -> str:
    from datetime import datetime, timezone
    dt = datetime.fromisoformat(f"{date}T{local_time}:00{utc_offset}")
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def export_schedule() -> None:
    """Process the real 2026 schedule (schedule_real.json) into the app's files:
    schedule.json = 72 group fixtures with teams/dates/venues; knockout_schedule.json
    = dates/venues for matches 73-104 (teams come from the bracket engine)."""
    raw = json.loads((OUT / "schedule_real.json").read_text())

    group = [m for m in raw if m["stage"] == "group"]
    # Derive matchday: within each group, order by kickoff -> [1,1,2,2,3,3].
    by_group: Dict[str, List] = {}
    for m in group:
        by_group.setdefault(m["group"], []).append(m)
    matchday = {}
    for gid, ms in by_group.items():
        for i, m in enumerate(sorted(ms, key=lambda x: (x["date"], x["localTime"]))):
            matchday[m["no"]] = i // 2 + 1

    fixtures = [{
        "id": f"M{m['no']}",
        "no": m["no"],
        "stage": "group",
        "group": m["group"],
        "matchday": matchday[m["no"]],
        "home": m["home"],
        "away": m["away"],
        "kickoffUTC": _to_utc(m["date"], m["localTime"], m["utcOffset"]),
        "date": m["date"],
        "localTime": m["localTime"],
        "venue": m["venue"],
        "city": m["city"],
    } for m in sorted(group, key=lambda x: x["no"])]
    (OUT / "schedule.json").write_text(json.dumps(fixtures, ensure_ascii=False, indent=2))

    knockout = [{
        "no": m["no"],
        "stage": m["stage"],
        "kickoffUTC": _to_utc(m["date"], m["localTime"], m["utcOffset"]),
        "date": m["date"],
        "localTime": m["localTime"],
        "venue": m["venue"],
        "city": m["city"],
    } for m in sorted((x for x in raw if x["stage"] != "group"), key=lambda x: x["no"])]
    (OUT / "knockout_schedule.json").write_text(json.dumps(knockout, ensure_ascii=False, indent=2))

    print(f"  schedule.json: {len(fixtures)} group fixtures (real dates/venues)")
    print(f"  knockout_schedule.json: {len(knockout)} knockout fixtures")


def export_golden_vectors(seed: int = 2026) -> None:
    """A full deterministic tournament: dump inputs + expected outputs."""
    rng = random.Random(seed)
    reg = default_registry()

    groups_payload: Dict[str, Dict] = {}
    thirds = []
    for gid in GROUP_IDS:
        gteams = reg.group(gid)
        codes = [t.code for t in gteams]
        matches = _round_robin(codes, rng)
        sim = GroupSimulator(gid, gteams)
        sim.add_matches(matches)
        standings = sim.standings()
        groups_payload[gid] = {
            "matches": [_match_to_dict(m) for m in matches],
            "expectedOrder": [row.record.code for row in standings],
        }
        thirds.append(standings[2].record)

    ranked = rank_third_place_teams(thirds)
    advancing_groups = [r.team.group for r in ranked[:8]]
    fixtures = build_round_of_32(advancing_groups)

    payload = {
        "seed": seed,
        "groups": groups_payload,
        "expectedThirdOrder": [r.team.code for r in ranked],
        "expectedAdvancingGroups": sorted(advancing_groups),
        "expectedR32": [{"match": f.match, "home": f.home, "away": f.away} for f in fixtures],
    }
    (OUT / "golden_vectors.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"  golden_vectors.json: 12 groups, R32 + third-place ranking captured")


if __name__ == "__main__":
    print("Exporting web data ->", OUT)
    export_teams()
    copy_annex_c()
    export_schedule()
    export_golden_vectors()
    print("Done.")
