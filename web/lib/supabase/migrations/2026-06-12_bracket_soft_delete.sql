-- ============================================================================
--  Migration — 2026-06-12 · Feature: server-side bracket deletion (soft delete)
--
--  Standalone add-on. Paste ONLY this into Supabase → SQL Editor → Run.
--  Do NOT re-run schema.sql. Adds one nullable column and nothing else.
--  🚫 Never put delete / truncate / drop in this file.
-- ============================================================================

-- When a user deletes a bracket we stamp deleted_at instead of hard-deleting, so
-- the deletion is recorded server-side and propagates to all the user's devices
-- (a hard delete leaves no trace, so another device re-uploads the bracket and it
-- comes back). Reads filter `deleted_at is null`; deleted brackets never score.
alter table public.brackets add column if not exists deleted_at timestamptz;
create index if not exists brackets_deleted_at_idx on public.brackets (deleted_at);
