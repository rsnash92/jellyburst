-- 0001_init.sql — JellyBurst Phase 1 (Foundations)
-- profiles + generations under RLS, a minimal signup trigger, and the private
-- jellyburst-generations Storage bucket. Schema mirrors PLAN.md §3 verbatim.
-- Idempotent: safe to re-run.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ───────────────────────── generations ─────────────────────────
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_key text not null,                -- our registry key, NOT the raw wavespeed id
  category text not null,                 -- 'image' | 'video' | 'audio' | '3d' | 'lipsync'
  status text not null default 'queued',  -- queued|processing|completed|failed|refunded
  input jsonb not null,
  credit_cost integer not null,
  wavespeed_task_id text,
  output_urls text[],
  wavespeed_raw jsonb,
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);
create index if not exists generations_wavespeed_task_idx
  on public.generations (wavespeed_task_id);

alter table public.generations enable row level security;

drop policy if exists "generations_select_own" on public.generations;
create policy "generations_select_own" on public.generations
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "generations_insert_own" on public.generations;
create policy "generations_insert_own" on public.generations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "generations_update_own" on public.generations;
create policy "generations_update_own" on public.generations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "generations_delete_own" on public.generations;
create policy "generations_delete_own" on public.generations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ─────────────────── minimal signup trigger ───────────────────
-- Auto-creates a profiles row on signup. Intentionally minimal: if it throws,
-- signup fails. NO credit grant here (deferred to Phase 4, server-side).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────── private storage bucket ───────────────────
-- Outputs are re-hosted here from Phase 2 and served via signed URLs.
insert into storage.buckets (id, name, public)
values ('jellyburst-generations', 'jellyburst-generations', false)
on conflict (id) do update set public = excluded.public;
