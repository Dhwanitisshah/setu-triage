-- 0004_visit_clinical_context.sql
-- Two clinical-context columns the rules engine (web/src/lib/triage/rules-engine.ts)
-- already knows how to use but that nothing in the schema captures yet.
--
-- Both are NULLABLE with no default. "Unknown" is a real, distinct clinical
-- state from "no", and must not be coerced into it: a blank pregnancy_weeks
-- does not mean "not pregnant," and an unrecorded has_spinal_cord_injury
-- does not mean "no injury." Defaulting either to false/0 would silently
-- misinform the rules engine's obstetric exclusion or spinal-cord-injury
-- caveat exactly the way a defaulted vitals column would misinform NEWS2
-- scoring (see the 0001_init.sql comment on `vitals`).
alter table visits
  add column pregnancy_weeks int check (pregnancy_weeks >= 0 and pregnancy_weeks <= 45),
  add column has_spinal_cord_injury boolean;

-- docs/TRIAGE_BANDS.md §3 "Known gaps" flagged this exact column as missing:
-- the rules engine's obstetric exclusion (§2.3) reads AssessmentContext.
-- pregnancyWeeks and excludes visits >= 20 weeks from automated banding, but
-- until now no caller could populate that from persisted data.
comment on column visits.pregnancy_weeks is
  'Gestational age in weeks. NULL = not pregnant or unknown -- never coerced to 0. Feeds the obstetric exclusion in docs/TRIAGE_BANDS.md section 2.3 (NEWS2 is not valid past 20 weeks of pregnancy); previously listed there as a known gap in section 3 because no persisted column existed to read it from.';

-- docs/TRIAGE_BANDS.md §3 "Known gaps" describes spinal cord injury as
-- guidance for whoever reads the score ("use with caution"), not an
-- exclusion -- the rules engine still produces a band, but labels it.
comment on column visits.has_spinal_cord_injury is
  'NULL = unknown, never coerced to false. Feeds the spinal-cord-injury caveat in docs/TRIAGE_BANDS.md section 3: NEWS2 may be unreliable for these patients due to autonomic disruption, so the rules engine still bands the visit but flags requires_manual_review and adds a caveat rather than excluding it.';
