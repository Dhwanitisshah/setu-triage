-- 0005_queue_partial_score.sql
-- The live queue (Phase 5) must render "at least <band>" whenever a band was
-- computed from a partial NEWS2 score (docs/TRIAGE_BANDS.md §2.4: a partial
-- score is a lower bound, never the final word). Nothing in the schema
-- captured that fact -- the rules engine has computed `isPartialScore` since
-- Phase 2 (web/src/lib/triage/rules-engine.ts), but it was discarded before
-- ever reaching triage_results.
alter table triage_results
  add column is_partial_score boolean not null default false;

comment on column triage_results.is_partial_score is
  'True when this band/score was computed from a subset of the seven NEWS2 parameters. docs/TRIAGE_BANDS.md section 2.4: a partial score is a lower bound on the true aggregate, never a conclusion -- the UI must render it as "at least <band>", not <band> alone. Existing rows default to false since no partial-score flag existed before this migration.';

-- =========================================================================
-- v_queue -- recreated to also expose is_partial_score (for the "at least
-- <band>" label) and triaged (whether a triage_results row exists at all,
-- distinguishing "unbanded" from "never triaged" -- both render as band =
-- null client-side, but only "triaged" rows carry a meaningful
-- requires_manual_review/is_partial_score value).
-- Ordering is unchanged from 0002_nullable_band.sql: red, unbanded, yellow,
-- green, never-triaged, then arrived_at ascending within each bucket.
-- =========================================================================
drop view if exists v_queue;

create view v_queue as
select
  v.id as visit_id,
  v.clinic_id,
  p.full_name,
  p.age,
  p.sex,
  v.chief_complaint,
  v.arrived_at,
  t.band,
  t.news2_score,
  t.is_partial_score,
  t.requires_manual_review,
  (t.id is not null) as triaged
from visits v
join patients p on p.id = v.patient_id
left join lateral (
  select tr.id, tr.band, tr.news2_score, tr.is_partial_score, tr.requires_manual_review
  from triage_results tr
  where tr.visit_id = v.id
  order by tr.created_at desc
  limit 1
) t on true
where v.status = 'waiting'
order by
  case
    when t.band = 'red' then 0
    when t.id is not null and t.band is null then 1 -- unbanded: triaged, NEWS2 does not apply
    when t.band = 'yellow' then 2
    when t.band = 'green' then 3
    else 4 -- never triaged: no triage_results row exists yet
  end,
  v.arrived_at asc;

-- Views don't inherit security_invoker across drop/create -- must be set
-- again every time this view is recreated, or it silently reintroduces the
-- RLS bypass fixed in 0003_queue_security_invoker.sql.
alter view public.v_queue set (security_invoker = on);
