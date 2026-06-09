-- ============================================================================
--  Migration — 2026-06-08 · REPAIR: ensure email-reminders objects exist
--
--  Why: a truncated copy of schema.sql (missing its Section 7) was run at one
--  point, so this DB may be missing the email-reminder column + table that the
--  pre-tournament reminder code (/api/reminders, lib/email.ts) depends on.
--
--  Safe to run regardless: both statements are `... if not exists`, so if these
--  objects already exist this is a harmless no-op. Paste ONLY this file into
--  Supabase → SQL Editor → Run. Do NOT re-run schema.sql.
--  🚫 Never put delete / truncate / drop in this file.
-- ============================================================================

-- Per-user opt-out for the pre-tournament reminder emails.
alter table public.profiles add column if not exists email_opt_out boolean not null default false;

-- Which reminder milestones have already gone out (so none re-fire). Written by
-- the server cron via the service role; not client-readable.
create table if not exists public.email_reminders_log (
  milestone_key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.email_reminders_log enable row level security;
-- No policies → only the service role (which bypasses RLS) can read/write it.
