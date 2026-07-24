-- Realtime for the live queue.
-- postgres_changes delivers nothing unless the table is in the supabase_realtime
-- publication — a missing table gives a silently dead subscription, not an error.
-- replica identity full is required so Postgres emits the whole row, which RLS
-- needs to filter events per subscriber.
-- Verified by the paired control/isolation assertions in scripts/rls-check.ts.

do $$
declare t text;
begin
  foreach t in array array['visits','triage_results','vitals'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.visits          replica identity full;
alter table public.triage_results  replica identity full;
alter table public.vitals          replica identity full;
