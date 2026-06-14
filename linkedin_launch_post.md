Every bracket app assumes the bracket is a fixed tree. For the 2026 World Cup, that's wrong.

It's the first 48-team, 12-group format with a new Round of 32, and 8 of its 16 matchups don't exist until all 12 groups are final. Which third-placed team feeds which knockout slot is a variable, not a constant.

So standard templates break on day one. I couldn't find an app that handled it, so I built the engine from scratch.

▶️ Watch the 60-second demo above to see how it works and change one result, then watch the whole bracket re-resolve live.

The whole thing is pure TypeScript with no solver running on a server. The entire tournament resolves client-side in the browser: 12 group tables, the third-place race, and the full knockout tree, with zero round-trips. It rebuilds in real time as you change picks.

It's also data-driven, not hardcoded to this bracket. The tiebreaker and seeding logic take the teams, the eligibility table, and the schedule as inputs, so the same engine extends to any group-stage-into-knockout tournament, in any sport.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + RLS) · Vercel

Change a single group-stage scoreline and it instantly:

→ Recomputes all 12 group tables under FIFA Article 13, including the recursive head-to-head re-application (when a sub-group stays tied, head-to-head metrics are recomputed on just those teams and applied again) that most implementations skip

→ Ranks all twelve 3rd-placed teams across separate groups and takes the top 8

→ Seeds the Round of 32 from FIFA's official Annex C table, one row for every C(12,8) = 495 combination of qualifying groups, with a deterministic solver as a fallback for rare combinations

→ Re-resolves the bracket all the way to the final

On top of the engine: live scoring feeds, private friend pools with their own leaderboards, and live Kalshi market odds wired into Golden Boot & Golden Glove predictions.

Map out all 104 games and see how the chaos plays out 👇

👉 https://bracketmachine.app/

#WorldCup2026 #SoftwareEngineering #TypeScript #BuildInPublic
