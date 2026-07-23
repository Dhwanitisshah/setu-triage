# Data Model

This describes the schema in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

## Tables

### clinics

A single clinic/facility using Setu. The root of the multi-tenant boundary —
every other clinical table hangs off `clinic_id` and is scoped to it by RLS.

### clinic_members

Maps an `auth.users` row to the clinic(s) they belong to, and their role
(`operator`, `doctor`, `admin`) within that clinic. This is the source of
truth RLS uses to decide what a signed-in user can see.

### patients

A person registered at a clinic. Tracks consent (`consent_given_at`,
`consent_withdrawn_at`) separately from the record itself, since DPDP
requires consent state to be inspectable and revocable without deleting the
underlying record.

### visits

One episode of a patient being at the clinic (arrival through discharge).
`status` moves `waiting -> in_consult -> done`. A patient can have many
visits over time; triage is always evaluated per-visit, not per-patient.

### vitals

A set of clinical measurements tied to a visit. **All seven clinical
columns are nullable.** Front-desk staff frequently cannot capture every
vital — missing equipment, an uncooperative or unconscious patient, time
pressure during a surge. If these columns had defaults, a rules or model
engine downstream would treat "not measured" as "measured and normal,"
which is a silent and dangerous misrepresentation for anything feeding a
triage decision. NULL is the only way to represent "we don't know" as
distinct from "this value is normal," so the schema forces every consumer
of vitals to handle the missing-data case explicitly rather than let the
database paper over it.

### triage_results

The outcome of a triage decision for a visit: a `band` (`green`/`yellow`/
`red`), who or what decided it (`rules`/`model`/`manual`), and the
supporting evidence (`news2_score`, `rules_triggered`, `model_score`,
`model_version`, `rationale`). A visit can accumulate multiple
`triage_results` rows over time as vitals are updated or a clinician
overrides an automated call — the table is an append-only history, not a
single mutable field on `visits`, so the reasoning behind past decisions is
never lost.

### share_links

A revocable, expiring link that lets a patient or caregiver view a triage
summary without a Setu login. **Only a SHA-256 hash of the token is
stored** (`token_hash`), never the raw token. The raw token exists for a
moment at creation time, is handed to whoever needs it, and is then
unrecoverable from the database — even a full database compromise cannot
be used to forge or replay share access, since validation re-hashes an
incoming token and compares against `token_hash` rather than looking up a
token directly. This table intentionally has no RLS policy for `anon` or
`authenticated` roles at all: token validation is a server-only operation
performed with the service-role key, so there is no client-safe query path
to gate.

### audit_log

An append-only record of who did what, to which entity, and with what
payload. There is deliberately no update or delete policy for anyone
(including clinic members) — an audit trail that can be edited or erased
by the people it might need to hold accountable is not an audit trail.

## v_queue

A view over `visits` (status = `waiting`) joined to each visit's patient
and its most recent `triage_results` row (via a `LEFT JOIN LATERAL ...
ORDER BY created_at DESC LIMIT 1`, so history accumulation in
`triage_results` never produces duplicate queue rows). Ordered red, then
yellow, then green, then untriaged, then by arrival time within each band.

Untriaged visits (no `triage_results` row yet) sort **last**, not because
an unassessed patient is assumed low-risk, but because the queue's job is
to surface known urgency first — an unknown risk level is a data gap the
staff need to close (by taking vitals / running triage), not a priority
signal in itself. This is called out as a comment directly above the
`ORDER BY` clause in the migration so it isn't accidentally "fixed" into
sorting untriaged patients first or by a default assumed band.

**`security_invoker`:** views default to running with their *owner's*
privileges, not the querying user's, which means a view over RLS-protected
tables silently bypasses RLS unless `security_invoker = on` is set
explicitly. `v_queue` shipped without this in Phase 3 and let any
authenticated operator read every clinic's queue, undetected until
`rls:check` was extended with a structural assertion for it (see
[`0003_queue_security_invoker.sql`](../supabase/migrations/0003_queue_security_invoker.sql)).
Every future view must set `security_invoker = on`, or it reintroduces the
same bypass — `scripts/rls-check.ts` now fails the run if any view in
`public` is missing it, so this can't regress silently again.

## Row Level Security

`public.user_clinic_ids()` is a `SECURITY DEFINER` function returning the
clinics a user belongs to. It has to be `SECURITY DEFINER` because RLS
policies on `clinic_members` itself would otherwise recurse into
`clinic_members`' own policy when evaluating `clinic_id in (select
user_clinic_ids())` — the definer function runs with the privileges of its
owner, bypassing RLS internally, so it can be safely called from other
tables' policies without a recursive policy evaluation loop.

Every clinical table's policies are scoped to `clinic_id in (select
user_clinic_ids())`, so a user can only ever see or write rows belonging to
a clinic they are a member of. `clinic_members` itself is readable only for
`user_id = auth.uid()` (a user can see their own memberships, not the
whole clinic's roster) and has no client-side write policy at all — role
assignment is an administrative, server-side operation. `share_links` has
no RLS policy for `anon` or `authenticated`, by design (see above).
`audit_log` allows insert and select scoped to clinic membership, but no
update or delete policy exists for any role.
