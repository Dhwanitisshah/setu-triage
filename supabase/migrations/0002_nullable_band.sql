-- 0002_nullable_band.sql
-- Make "unbanded" representable: paediatric and obstetric visits are not
-- excluded from NEWS2 by forcing band='red' (that conflates "cannot be
-- scored" with "most severe" — see docs/TRIAGE_BANDS.md §1). They now write
-- band = NULL with requires_manual_review = true, alongside the NEWS2 score
-- reported and clearly marked as not valid for banding.

alter table triage_results alter column band drop not null;
-- The existing check constraint (band in ('green','yellow','red')) already
-- permits NULL on a nullable column, since a check constraint only
-- evaluates non-null values.

-- =========================================================================
-- v_queue — recreated to distinguish "unbanded" (a triage_results row
-- exists, but NEWS2 does not apply to this patient) from "not yet triaged"
-- (no triage_results row exists at all). These are different states and
-- must not collapse into the same bucket: a never-triaged visit simply
-- hasn't been assessed yet, while an unbanded visit HAS been assessed and
-- the assessment concluded that a human must decide instead of NEWS2.
--
-- Ordering: red, then unbanded, then yellow, then green, then never-triaged.
-- Unbanded sorts second — ahead of yellow and green — because it needs
-- human judgement promptly (the automated system is explicitly declining to
-- vouch for this patient's safety). But it must not outrank red: an
-- unbanded visit is not known to be physiologically critical, and letting
-- "we don't know" jump the queue ahead of "we know this is critical" would
-- itself be a mis-triage.
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
  t.requires_manual_review
from visits v
join patients p on p.id = v.patient_id
left join lateral (
  select tr.id, tr.band, tr.news2_score, tr.requires_manual_review
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
