-- 0002_realtime.sql — JellyBurst Phase 2
-- Enable Supabase Realtime (Postgres Changes) for public.generations so the studio sees
-- placeholder→asset transitions live. BOTH steps are required or no UPDATE events are emitted.
-- Idempotent: safe to re-run.

-- 1) Add generations to the supabase_realtime publication (guarded — a bare ADD errors if present).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'generations'
  ) then
    alter publication supabase_realtime add table public.generations;
  end if;
end $$;

-- 2) Full replica identity so UPDATE events carry the row (required for Postgres Changes).
alter table public.generations replica identity full;
