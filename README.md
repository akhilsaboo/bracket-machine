# Bracket Machine

A live, interactive bracket builder for the 2026 FIFA World Cup. Pick scores for every group-stage match, watch standings recompute instantly with full FIFA tiebreakers, and your knockout bracket builds itself via the official Annex C allocation. Auto-fill with AI personas, keep multiple brackets, compete with friends in pools, predict tournament futures against live Kalshi odds, and get AI matchup insights.

🔗 **Live:** https://bracketmachine.app

## Tech

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 — in `web/`
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Vercel (apex domain `bracketmachine.app`) — daily cron pre-generates matchup insights
- **AI:** Claude (Anthropic API) for matchup predictions/storylines; Google Cloud TTS for the spoken recap; The Odds API for win-probability bars
- **Markets:** Kalshi public market-data API (no key) for Predictions/Futures odds
- **Engine:** Python reference implementation at the repo root (`teams.py`, `group_tiebreak.py`, `lookup_table.py`, `main.py`) + verified TypeScript port in `web/lib/engine/`. The TS port is validated against golden vectors produced by the Python engine on every build.

## Highlights

- Full FIFA 2026 group-stage tiebreaker cascade (head-to-head → overall GD → goals → fair play → FIFA ranking), recursive 3-way tie handling included.
- Official 495-row Annex C table for third-place team allocation (`web/data/annexC.json`).
- Real match schedule (dates / times / venues / fixtures) for all 104 matches.
- Score-input + click-to-pick interaction on every match; bracket auto-fills as you predict.
- **One-click auto-fill** via 6 AI personas (Statistical Purist, Chaos Agent, Overconfident Patriot, FIFA Gamer, Vibe Archivist with a flag-duel picker, Historic Nostalgist) — deterministic client-side heuristics, fully editable after.
- **Up to 25 named brackets** per user with a header switcher (create / rename / duplicate / delete), plus **second-chance brackets** seeded from the real Round of 32 once the group stage ends.
- Lock-at-kickoff — each match becomes non-editable the moment it kicks off.
- Pick grading once results land: green ★ exact, yellow ✓ correct outcome, red ✗ wrong.
- Friend pools with shareable invite links (`?join=CODE`), leaderboards combining group + knockout scoring, **per-pool bracket attribution** (choose which of your brackets competes in each pool), and per-member bracket viewing once knockout begins.
- **Predictions / Futures** (🔮): call the tournament's big questions (Winner, Golden Boot/Ball/Glove, Messi-vs-Ronaldo, furthest host, first-time winner) with **live Kalshi market odds** and country flags on every option. Odds-weighted scoring (bolder calls pay more, capped at 100), picks synced to your account, and a **per-pool 🎯 Predictions leaderboard** alongside the bracket board.
- **AI matchup insights** (📰): per-match prediction + storylines (Claude), win-probability bars (The Odds API), and a ~30s spoken recap (Google Cloud TTS). Cached in Supabase and pre-generated daily by a Vercel cron so they're instant.
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

## Environment variables

Set in Vercel (and `web/.env.local` for local dev). The app degrades gracefully when any are missing.

| Var | Purpose | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (accounts, pools, saved brackets, insight cache) | Guest mode only (localStorage) |
| `ANTHROPIC_API_KEY` | Claude — generates matchup insights | 📰 shows "not turned on yet" |
| `GOOGLE_TTS_API_KEY` | Google Cloud TTS — natural spoken recap | Falls back to browser speech synthesis |
| `THE_ODDS_API_KEY` | The Odds API — win-probability bars | Bars hidden (AI text still works) |
| `CRON_SECRET` | Auth for the daily cron (insights + odds freeze + pick resolution) | Cron runs unprotected |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side pick resolution (settles `prediction_picks.correct`) | 🎯 leaderboard stays "potential" (never resolves to earned) |

⚠️ Supabase schema lives in `web/lib/supabase/schema.sql` — paste/run it in the Supabase SQL Editor (idempotent) after any change; it is **not** auto-applied.

## Structure

```
.
├── web/                  Next.js app (the live site)
│   ├── app/              App Router pages + API routes (/api/insight, /api/insight/cron, /api/tts, /api/kalshi)
│   ├── components/       UI (PoolsView, BracketTree, MatchRow, BracketSwitcher, AutoFillModal, MatchInsight, …)
│   ├── lib/              data + engine port + scoring + auth/Supabase + autofill personas + insights
│   └── data/             teams, schedule, Annex C, golden vectors (exported)
├── *.py                  Python reference engine + data prep
├── teams.csv             48 teams (post-playoff), groups A–L, FIFA ranks
├── annex_c.json          full 495-row third-place allocation
└── tiebreaker_rules.md   prose description of the tiebreaker logic
```

## Status

Hobby project · not affiliated with FIFA · friend-pool play live ahead of the June 2026 tournament.
