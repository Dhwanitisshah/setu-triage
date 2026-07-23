-- 0003_queue_security_invoker.sql
-- Views default to security_invoker = false: they execute with the view
-- OWNER's privileges, not the querying user's. Since the view owner is
-- typically a superuser/table-owning role, this means a view over
-- RLS-protected tables silently BYPASSES RLS entirely unless
-- security_invoker is turned on explicitly — v_queue was created without
-- it, so any authenticated user could read every clinic's queue through
-- v_queue even though patients/visits/triage_results RLS was correctly
-- scoped. Every future view over an RLS-protected table MUST set
-- security_invoker = on, or it reintroduces this exact bypass.
alter view public.v_queue set (security_invoker = on);

-- With security_invoker on, RLS (and privilege checks) are evaluated as
-- the invoking user rather than the view owner, so the invoking user now
-- needs their own SELECT grant on the underlying tables. Make that
-- explicit rather than relying on whatever default grants happen to exist.
grant select on public.visits to authenticated;
grant select on public.patients to authenticated;
grant select on public.triage_results to authenticated;

-- =========================================================================
-- views_missing_security_invoker — structural guard used by
-- scripts/rls-check.ts. Returns the name of every view in the public
-- schema that does NOT have security_invoker = on, so a future view
-- created without it fails rls:check immediately instead of silently
-- bypassing RLS the way v_queue did.
-- =========================================================================
create or replace function public.views_missing_security_invoker()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v'
    and n.nspname = 'public'
    and coalesce(
      (
        select o.option_value::boolean
        from pg_options_to_table(c.reloptions) o
        where o.option_name = 'security_invoker'
      ),
      false
    ) = false
$$;

grant execute on function public.views_missing_security_invoker() to authenticated;
