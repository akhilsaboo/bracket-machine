-- ============================================================================
--  Migration — 2026-06-08 · Feature: AI-persona analytics (owner dashboard)
--
--  Standalone add-on. Paste ONLY this into Supabase → SQL Editor → Run.
--  Do NOT re-run schema.sql. This adds one nullable column and nothing else.
--  🚫 Never put delete / truncate / drop in this file.
-- ============================================================================

-- Records which auto-fill persona generated a bracket (null = built by hand).
-- Powers the "AI persona used" chart on the owner dashboard (/admin). Value is an
-- auto-fill mode id from web/lib/autofill.ts (e.g. 'chaos_agent', 'purist').
alter table public.brackets add column if not exists fill_mode text;
