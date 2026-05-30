# Tiebreaker Rules — FIFA World Cup 2026 Bracket Engine

This document describes the ranking logic implemented in `group_tiebreak.py`
and `lookup_table.py`.

## 1. Group ranking

Teams in a group are ranked first by **total points** (win = 3, draw = 1,
loss = 0). Any set of teams level on points is resolved by the cascade below.

### Step 1 — Head-to-head (matches *between the tied teams only*)

Applied in order:

1. Points obtained in the matches between the teams concerned.
2. Goal difference in those matches.
3. Goals scored in those matches.

**Re-application (the recursion).** If Step 1 separates one or more teams but
leaves a *smaller* subset still level, Step 1 is **re-applied to that subset
only**, recomputing head-to-head purely from the matches among the remaining
teams. This mirrors FIFA Regulations Art. 13.5(d). A team that drops out of a
larger cluster does **not** re-enter the comparison for the teams above or
below it.

> Example (3-way tie A/B/C): if head-to-head goal difference separates C to the
> bottom, A and B are re-compared using *only* the A–B match. If that match had
> a winner, it decides them immediately and C is never reconsidered.

### Step 2 — Global metrics (all group matches)

Applied only to teams still perfectly level after Step 1 is exhausted:

1. Overall goal difference across all group matches.
2. Overall goals scored across all group matches.
3. Team conduct (fair-play) score.

At this point teams that were dropped earlier *do* affect the comparison again,
because these metrics span every group match (including those against
already-separated teams).

### Step 3 — Ultimate decider

4. Base FIFA / Coca-Cola Men's World Ranking.

The FIFA ranking is unique per team, so Step 3 always produces a strict total
order and the algorithm is guaranteed to terminate. (The official regulations
end with "drawing of lots"; this engine substitutes the FIFA ranking so results
are deterministic and reproducible. Swap `_resolve_global` if you need lots.)

### Conduct / fair-play scoring

Per-match card deductions (see `CARD_DEDUCTIONS` in `group_tiebreak.py`):

| Event                         | Points |
|-------------------------------|:------:|
| Yellow card                   |  −1    |
| Second yellow (indirect red)  |  −3    |
| Direct red card               |  −4    |
| Yellow + direct red (same player) | −5 |

A team's conduct score is the sum of deductions (≤ 0). **Closer to zero is
better.**

## 2. Cross-group third-place ranking

The 12 third-placed teams are compared in a single table to find the **8 that
advance**. Head-to-head is **not** used (teams come from different groups).
Order: points → goal difference → goals scored → conduct → FIFA ranking.
See `rank_third_place_teams`.

## 3. Round-of-32 allocation (`lookup_table.py`)

* `ROUND_OF_32_SCHEDULE` is the real, fixed bracket (matches 73–88). Eight of
  the sixteen matches pair a group winner with a best third-placed team; the
  eligible third-place groups for each such slot are fixed and listed in
  `THIRD_PLACE_SLOTS`.
* Which of the eight advancing third-place groups fills which slot is FIFA
  **Annex C** — a 495-row table (one row per `C(12,8)` combination).
  * Supply the official table as JSON via `load_annex_c(path)` to use it
    verbatim. Key format: an 8-letter alphabetical string (e.g. `"ADEGHIJL"`)
    mapping match number → third-place group letter.
  * If no official table is loaded, `solve_assignment` computes a valid
    assignment by perfect bipartite matching against the eligibility sets. This
    is verified to produce a legal, same-group-avoiding allocation for **all
    495 combinations**. Where several legal matchings exist, FIFA's published
    Annex C choice should override the solver — load the JSON to guarantee an
    exact match to the official bracket.

## Constant a team can never face

A third-placed team is never assigned to a slot hosted by the winner of its own
group; the eligibility sets already exclude that case, and `solve_assignment`
enforces it.
