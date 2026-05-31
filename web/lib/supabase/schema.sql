-- World Cup 2026 Bracket Machine — initial schema.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run (idempotent).

-- 1. Profiles (one per auth user) ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: owner read"   on public.profiles;
drop policy if exists "profiles: owner insert" on public.profiles;
drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner update" on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Brackets (multiple per user) -----------------------------------------------
create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Bracket',
  predictions jsonb not null default '{}'::jsonb,  -- group scores keyed by match id
  knockout    jsonb not null default '{}'::jsonb,  -- knockout winner picks
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brackets_user_id_idx on public.brackets (user_id);
alter table public.brackets enable row level security;

-- Additional bracket columns (idempotent).
alter table public.brackets add column if not exists submitted_at timestamptz;
alter table public.brackets add column if not exists tiebreaker_total_goals integer;
alter table public.brackets add column if not exists awards jsonb not null default '{}'::jsonb;
-- 'normal' | 'second_chance' (knockout-only bracket pre-filled from the real R32)
alter table public.brackets add column if not exists kind text not null default 'normal';

drop policy if exists "brackets: owner all" on public.brackets;
create policy "brackets: owner all" on public.brackets
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists brackets_touch on public.brackets;
create trigger brackets_touch before update on public.brackets
  for each row execute function public.touch_updated_at();

-- 3. Pools (friend leagues) -----------------------------------------------------
create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists pools_owner_idx on public.pools(owner_id);
alter table public.pools enable row level security;

create table if not exists public.pool_members (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
create index if not exists pool_members_user_idx on public.pool_members(user_id);
alter table public.pool_members enable row level security;
-- Which of the member's brackets is attributed to this pool (nullable; the same
-- bracket can be attributed to many pools).
alter table public.pool_members add column if not exists bracket_id uuid references public.brackets(id) on delete set null;

-- Helper: am I a member of this pool?
create or replace function public.is_pool_member(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.pool_members where pool_id = pid and user_id = auth.uid());
$$;

-- Helper: do I share at least one pool with another user?
create or replace function public.shares_pool_with(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.pool_members m1
    join public.pool_members m2 on m1.pool_id = m2.pool_id
    where m1.user_id = auth.uid() and m2.user_id = other
  );
$$;

-- Lookup a pool by its invite code (bypasses RLS so non-members can see name before joining)
create or replace function public.find_pool_by_invite(code text)
returns table(id uuid, name text)
language sql security definer stable set search_path = public as $$
  select id, name from public.pools where invite_code = code limit 1;
$$;

-- Idempotent join by invite code, attributing a chosen bracket (optional).
drop function if exists public.join_pool_by_invite(text);
create or replace function public.join_pool_by_invite(code text, bid uuid default null)
returns table(pool_id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  select id, public.pools.name into p from public.pools where invite_code = code;
  if not found then
    raise exception 'invite code not found';
  end if;
  insert into public.pool_members (pool_id, user_id, bracket_id) values (p.id, auth.uid(), bid)
    on conflict do nothing;
  pool_id := p.id; name := p.name; return next;
end;
$$;

-- RLS — pools
drop policy if exists "pools: member or owner read" on public.pools;
create policy "pools: member or owner read" on public.pools for select
  using (owner_id = auth.uid() or public.is_pool_member(id));
drop policy if exists "pools: owner insert" on public.pools;
create policy "pools: owner insert" on public.pools for insert
  with check (owner_id = auth.uid());
drop policy if exists "pools: owner update" on public.pools;
create policy "pools: owner update" on public.pools for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "pools: owner delete" on public.pools;
create policy "pools: owner delete" on public.pools for delete
  using (owner_id = auth.uid());

-- RLS — pool_members
drop policy if exists "pool_members: same-pool read" on public.pool_members;
create policy "pool_members: same-pool read" on public.pool_members for select
  using (user_id = auth.uid() or public.is_pool_member(pool_id));
drop policy if exists "pool_members: self insert" on public.pool_members;
create policy "pool_members: self insert" on public.pool_members for insert
  with check (user_id = auth.uid());
drop policy if exists "pool_members: self update" on public.pool_members;
create policy "pool_members: self update" on public.pool_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "pool_members: leave or kick" on public.pool_members;
create policy "pool_members: leave or kick" on public.pool_members for delete
  using (user_id = auth.uid() or exists(
    select 1 from public.pools where id = pool_id and owner_id = auth.uid()
  ));

-- Pool-mates can see each other's brackets and profiles (so leaderboards work)
drop policy if exists "brackets: pool mates can view" on public.brackets;
create policy "brackets: pool mates can view" on public.brackets for select
  using (user_id = auth.uid() or public.shares_pool_with(user_id));
drop policy if exists "profiles: pool mates can view" on public.profiles;
create policy "profiles: pool mates can view" on public.profiles for select
  using (id = auth.uid() or public.shares_pool_with(id));
