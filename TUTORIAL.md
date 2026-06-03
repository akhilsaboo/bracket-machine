# Bracket Machine — User Tutorial (draft)

> A walkthrough for friends / first-time visitors. Edit freely; this is meant as a starting template for a polished onboarding doc or in-app help.

## 1. The 30-second pitch

**Bracket Machine** is your interactive 2026 World Cup bracket. Pick scores for every group-stage match → the standings update live (full FIFA tiebreakers included) → your knockout bracket builds itself via the official Annex C allocation. Don't want to click through all 72 matches? Let an **AI persona** fill it for you. Keep **multiple brackets**, compete with friends in **pools**, call the tournament's big **🔮 Predictions** against live betting odds, and tap **📰 Insights** on any match for an AI preview (with a 30-second audio recap).

Live at **https://bracketmachine.app**.

## 2. Your first 5 minutes

1. **Sign in (optional).** Top-right pill → Continue with Google or create an email/password account. Picks save to your account and follow you between devices. You can also play as a guest — picks save locally in your browser and attach to your account when you sign in.
2. **Group Stage tab.** Pick a winner by clicking a team (it turns green), or type exact scores. The center **DRAW** button sets a draw. Each group's standings recompute as you type. (Full FIFA tiebreakers: head-to-head → overall GD → goals → fair play → ranking.)
3. **Or auto-fill it (see §3).** On your first visit a pop-up offers to fill the whole bracket for you — pick an AI persona and tweak from there.
4. **See your bracket.** Once all 12 groups are filled, a **"See your bracket →"** button takes you to the Bracket tab. (Nothing locks — every pick stays editable until that match kicks off.)
5. **Bracket tab.** The Round of 32 is already filled in from your group results. Click teams to advance them through R16 → QF → SF → Final.
6. **Submit Bracket.** Pick your champion → optionally enter a tiebreaker (predict total goals scored in the tournament). The tiebreaker is optional — skip it and you'll just lose any points tie to someone who guessed.

## 3. Auto-fill with an AI persona

Don't want to pick all 72 matches by hand? Hit the **⚡ Auto-fill** button on the Group Stage tab (it also pops up automatically on your first visit) and choose a personality — it fills your whole bracket, and you can edit anything afterward:

- **🤓 The Statistical Purist** — trusts the FIFA rankings; favorites win, no silly upsets.
- **🃏 The Chaos Agent** — the underdog lover; triggers upsets everywhere (different every time you pick it).
- **🏆 The Overconfident Patriot** — pick your nation and they win every match, all the way to the trophy.
- **🎮 The FIFA Gamer** — ranks teams by star-player firepower; the flashy superstar squads go far.
- **🎨 The Vibe Archivist** — for the non-fan: judge a few **flags** head-to-head, and your favorites march on.
- **🏛️ The Historic Nostalgist** — World Cup legacy beats current form; the traditional giants advance.

## 4. Multiple brackets

Use the **bracket switcher** (the ▾ pill in the header) to keep up to **25 brackets** — make a serious one, a chaos one, a homer one, whatever. Create, rename, duplicate, or delete from the dropdown. Each bracket is independent; switch between them anytime.

**Second-chance brackets:** once the real group stage finishes, you can start a **🔄 Second-Chance bracket** (from the switcher or the banner that appears) — it's pre-filled with the *actual* Round of 32, so you just fill out the knockout tree. Great for jumping back in if your original bracket busted.

## 5. The Schedule tab

The same predictions in chronological order:
- Grouped by **calendar day** with kickoff times + host city.
- Matches lock at kickoff: once a match starts, your pick freezes, the row turns red, and drops to the bottom.
- After matches happen, picks are graded: **★ green** (exact), **✓ yellow** (correct outcome), **✗ red** (wrong).

## 6. Matchup insights (📰)

Tap the **📰** button on any match (Group Stage or Schedule) for an AI-generated preview:
- A one-line **prediction** and 2–3 **storylines**.
- **Win-probability bars** from real bookmaker odds (these appear once betting markets go live, close to the tournament).
- A **🔊 Play 30s recap** button — a short spoken preview, like a broadcaster's intro.

Near a match, insights pull in current form and news; further out they're quick takes. Either way they're cached, so they load instantly.

## 7. Pools (friend leagues)

**Pools tab → Create a pool** → you get a 6-character invite code and a shareable link (`https://bracketmachine.app/?join=ABC123`).
- Anyone you send the link to can sign in and join in one click.
- **Your entry:** choose *which* of your brackets competes in each pool (you can use the same bracket in several pools, or a different one in each).
- The pool detail shows two leaderboards: a **🏆 Bracket** board combining group + knockout points, and a **🎯 Predictions** board for Futures picks (see §8).
- Click another member's row (only after the knockout starts, June 28) to see their full bracket read-only.
- Pool owners can delete the pool; members can leave anytime.

## 8. Predictions tab (🔮 Futures)

Call the tournament's big questions: **World Cup Winner, Golden Boot** (top scorer), **Golden Ball** (best player), **Golden Glove** (best keeper), **Messi vs Ronaldo**, **furthest-advancing host nation**, and **first-time winner**.

- Each option shows its **live market-implied chance** from Kalshi (and a country flag, so you know which nation a player represents). Options sort by likelihood, favorites first.
- Picks are **odds-weighted**: a correct pick earns `round(10 ÷ chance)`, capped at 100 — the bolder (less likely) your correct call, the more it's worth. Each option shows the points it would pay.
- Picks **save to your account** and sync across devices (guests save locally and migrate up on sign-in).
- Each pool gets a **🎯 Predictions leaderboard** alongside the bracket board. Before games resolve it ranks by *potential* points; once markets settle it switches to points earned on correct calls.
- Odds read "—" for markets that don't have a real price yet; they fill in as betting markets get liquid closer to kickoff, then lock ~2 days before the tournament.

A **⚔️ Games** sub-tab (per-knockout-match predictions) unlocks when the knockout rounds begin (June 28).

## 9. How scoring works

**Group stage** — per match:
- **★ +10** exact score (both winner and scoreline right)
- **✓ +5** correct outcome (right winner/draw, wrong score)

**Knockout** — *team advancement* (March-Madness style): you earn a round's points for each team you correctly predicted to **reach** that round, no matter who they actually played. One early upset won't tank your whole bracket. Per round:
- Reach R16 (win an R32 tie): **+20**
- Reach QF: **+40**
- Reach SF: **+80**
- Reach Final / win 3rd-place: **+160**
- Champion: **+320**
- **Exact-slot bonus: +10** whenever that team is in the exact bracket position you predicted (shown as a green +10 chip).

Colors in the bracket: 🟢 green = your pick advanced as predicted, 🔴 red = it didn't. (No yellow in the knockout — there's no scoreline to be partially right about.)

**Ties** broken by: total points → knockout points → exact-score count → tiebreaker total-goals (optional; an unset tiebreaker loses to any guess).

**Predictions / Futures** — odds-weighted, scored separately on the 🎯 Predictions leaderboard: a correct pick earns `round(10 ÷ chance)`, capped at 100 (so a coin-flip ≈ 20, a 10% longshot = 100). Wrong picks score 0.

## 10. FAQ

For longer explanations, see **[FAQ](https://bracketmachine.app/faq)** — it covers password safety, when brackets lock, why you can't see pool-mates' group picks (privacy until knockout starts), what to do if you forget your password, and more.

## 11. About / disclaimers

Not affiliated with FIFA. Hobby project — picks are for entertainment / friend pools only. AI insights are generated by an LLM and may be wrong; don't bet the house.

---

*This document is a draft. Polish for the audience you want — short user video script, in-app walkthrough, README expansion, etc.*
