-- ============================================================================
--  Migration — 2026-06-08 · Feature: Global (all-users) leaderboard
--
--  Standalone add-on. Paste ONLY this into Supabase → SQL Editor → Run.
--  Do NOT re-run schema.sql. This adds one new table and nothing else.
--  🚫 Never put delete / truncate / drop in this file.
-- ============================================================================

-- Server-computed cache of the overall leaderboard. The /api/leaderboard route
-- scores every submitted bracket against live results and stores the top-N here,
-- so clients read one small precomputed row instead of scanning all brackets
-- (keeps it scalable — see the route for the TTL + recompute logic). Written only
-- by the service role; no public policies (RLS on, service role bypasses it).
create table if not exists public.leaderboard_snapshot (
  key text primary key,           -- 'global'
  payload jsonb not null,         -- { rows: [...], totalPlayers, hasResults, updatedAt }
  updated_at timestamptz not null default now()
);
alter table public.leaderboard_snapshot enable row level security;
