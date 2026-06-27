-- ============================================================================
--  Migration — 2026-06-27 · Feature: Double-or-Nothing stakes (second-chance)
--
--  Standalone add-on. Paste ONLY this into Supabase → SQL Editor → Run.
--  Do NOT re-run schema.sql. This adds one column and nothing else.
--  🚫 Never put delete / truncate / drop in this file.
-- ============================================================================

-- Double-or-Nothing stakes for second-chance brackets: at most one staked match
-- per knockout round, stored as { <round bucket>: <match no> } — e.g.
-- {"r32":74,"qf":98}. A staked pick that lands pays DOUBLE the round's base
-- points; one that misses subtracts them. See web/lib/scoring.ts (Boosts).
alter table public.brackets add column if not exists boosts jsonb not null default '{}'::jsonb;
