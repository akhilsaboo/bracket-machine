# Bracket Machine

A live, interactive bracket builder for the 2026 FIFA World Cup. Pick scores for every group-stage match, watch standings recompute instantly with full FIFA tiebreakers, and your knockout bracket builds itself via the official Annex C allocation. Compete with friends in pools.

🔗 **Live:** https://bracketmachine.app

## Tech

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 — in `web/`
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Vercel (apex domain `bracketmachine.app`)
- **Engine:** Python reference implementation at the repo root (`teams.py`, `group_tiebreak.py`, `lookup_table.py`, `main.py`) + verified TypeScript port in `web/lib/engine/`. The TS port is validated against golden vectors produced by the Python engine on every build.

## Highlights

- Full FIFA 2026 group-stage tiebreaker cascade (head-to-head → overall GD → goals → fair play → FIFA ranking), recursive 3-way tie handling included.
- Official 495-row Annex C table for third-place team allocation (`web/data/annexC.json`).
- Real match schedule (dates / times / venues / fixtures) for all 104 matches.
- Score-input + click-to-pick interaction on every match; bracket auto-fills as you predict.
- Lock-at-kickoff — each match becomes non-editable the moment it kicks off.
- Pick grading once results land: green ★ exact, yellow ✓ correct outcome, red ✗ wrong.
- Friend pools with shareable invite links (`?join=CODE`), leaderboards combining group + knockout scoring, and per-member bracket viewing once knockout begins.
- Google OAuth + email/password auth via Supabase, with RLS keeping data scoped per-user / per-pool.

## Development

From repo root:

```bash
npm run dev       # next dev (proxies into web/)
npm run build     # next build
npm run validate  # asserts TS engine matches Python golden vectors
npm run deploy    # vercel --prod (production)
npm run preview   # vercel        (preview deploy)
```

To work on the Python engine:

```bash
python3 main.py             # runs the demo tournament + 3-way tie scenarios
python3 export_web_data.py  # regenerates web/data/{teams,annexC,schedule,golden_vectors}.json
```

## Structure

```
.
├── web/                  Next.js app (the live site)
│   ├── app/              App Router pages (/, /privacy, /terms, /faq, /auth/callback)
│   ├── components/       UI (PoolsView, BracketTree, MatchRow, AuthControls, …)
│   ├── lib/              data + engine port + scoring + auth/Supabase + results/scoring
│   └── data/             teams, schedule, Annex C, golden vectors (exported)
├── *.py                  Python reference engine + data prep
├── teams.csv             48 teams (post-playoff), groups A–L, FIFA ranks
├── annex_c.json          full 495-row third-place allocation
└── tiebreaker_rules.md   prose description of the tiebreaker logic
```

## Status

Hobby project · not affiliated with FIFA · friend-pool play live ahead of the June 2026 tournament.
