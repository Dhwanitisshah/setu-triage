-- 0001_init.sql
-- Core schema for Setu triage: clinics, staff, patients, visits, vitals,
-- triage results, share links, and audit log.

create extension if not exists pgcrypto;

-- =========================================================================
-- clinics
-- =========================================================================
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- clinic_members — maps auth.users to the clinic(s) they belong to
-- =========================================================================
create table clinic_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  role text not null check (role in ('operator', 'doctor', 'admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);

-- =========================================================================
-- patients
-- =========================================================================
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  full_name text not null,
  age int check (age >= 0 and age <= 130),
  sex text check (sex in ('male', 'female', 'other')),
  consent_given_at timestamptz not null,
  consent_withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- visits
-- =========================================================================
create table visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  patient_id uuid not null references patients(id),
  arrived_at timestamptz not null default now(),
  chief_complaint text,
  status text not null check (status in ('waiting', 'in_consult', 'done')) default 'waiting',
  created_at timestamptz not null default now()
);

-- =========================================================================
-- vitals
-- All seven clinical columns are nullable: front-desk staff frequently
-- cannot measure every vital (missing equipment, uncooperative patient,
-- triage under time pressure). Forcing a default would silently fabricate
-- data the rules/model engine would then treat as real. NULL must mean
-- "not measured", never "normal".
-- =========================================================================
create table vitals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  visit_id uuid not null references visits(id) on delete cascade,
  respiratory_rate int,
  spo2 int,
  on_supplemental_oxygen boolean default false,
  temperature_c numeric(4, 1),
  systolic_bp int,
  pulse int,
  consciousness text check (
    consciousness in ('alert', 'confusion', 'voice', 'pain', 'unresponsive')
  ),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =========================================================================
-- triage_results
-- =========================================================================
create table triage_results (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  visit_id uuid not null references visits(id) on delete cascade,
  band text not null check (band in ('green', 'yellow', 'red')),
  decided_by text not null check (decided_by in ('rules', 'model', 'manual')),
  news2_score int,
  rules_triggered jsonb not null default '[]'::jsonb,
  model_score numeric,
  model_version text,
  rationale text,
  requires_manual_review boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- share_links
-- Only a SHA-256 hash of the share token is ever stored. The raw token is
-- generated and handed to the patient/caregiver once, and is unrecoverable
-- from the database — validation re-hashes an incoming token and compares.
-- =========================================================================
create table share_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  visit_id uuid not null references visits(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- =========================================================================
-- audit_log
-- =========================================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- indexes
-- =========================================================================
create index idx_visits_clinic_status on visits (clinic_id, status);
create index idx_visits_patient on visits (patient_id);
create index idx_vitals_visit on vitals (visit_id);
create index idx_triage_results_visit_created on triage_results (visit_id, created_at desc);
create index idx_share_links_token_hash on share_links (token_hash);
create index idx_audit_log_clinic_created on audit_log (clinic_id, created_at desc);

-- =========================================================================
-- v_queue — the waiting-room queue, ordered by clinical priority
--
-- Untriaged patients (band is null) sort last because they have not yet
-- been assessed, not because they are considered low priority. Do not
-- reorder this list to imply otherwise.
-- =========================================================================
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
  select tr.band, tr.news2_score, tr.requires_manual_review
  from triage_results tr
  where tr.visit_id = v.id
  order by tr.created_at desc
  limit 1
) t on true
where v.status = 'waiting'
order by
  case t.band
    when 'red' then 0
    when 'yellow' then 1
    when 'green' then 2
    else 3
  end,
  v.arrived_at asc;

-- =========================================================================
-- Row Level Security
-- =========================================================================

-- security definer so RLS policies on clinic_members-dependent tables can
-- call this without recursing into clinic_members' own RLS policy.
create function public.user_clinic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from clinic_members where user_id = auth.uid()
$$;

alter table clinics enable row level security;
alter table clinic_members enable row level security;
alter table patients enable row level security;
alter table visits enable row level security;
alter table vitals enable row level security;
alter table triage_results enable row level security;
alter table share_links enable row level security;
alter table audit_log enable row level security;

-- Prevents any user from seeing or modifying clinics they are not a member of.
create policy clinics_select on clinics
  for select to authenticated
  using (id in (select user_clinic_ids()));

create policy clinics_insert on clinics
  for insert to authenticated
  with check (id in (select user_clinic_ids()));

create policy clinics_update on clinics
  for update to authenticated
  using (id in (select user_clinic_ids()))
  with check (id in (select user_clinic_ids()));

-- Prevents a user from reading other users' clinic memberships/roles, and
-- prevents any client-side write to membership (role changes are admin-only,
-- server-side operations).
create policy clinic_members_select on clinic_members
  for select to authenticated
  using (user_id = auth.uid());

-- Prevents cross-clinic access to patient records.
create policy patients_select on patients
  for select to authenticated
  using (clinic_id in (select user_clinic_ids()));

create policy patients_insert on patients
  for insert to authenticated
  with check (clinic_id in (select user_clinic_ids()));

create policy patients_update on patients
  for update to authenticated
  using (clinic_id in (select user_clinic_ids()))
  with check (clinic_id in (select user_clinic_ids()));

-- Prevents cross-clinic access to visit records.
create policy visits_select on visits
  for select to authenticated
  using (clinic_id in (select user_clinic_ids()));

create policy visits_insert on visits
  for insert to authenticated
  with check (clinic_id in (select user_clinic_ids()));

create policy visits_update on visits
  for update to authenticated
  using (clinic_id in (select user_clinic_ids()))
  with check (clinic_id in (select user_clinic_ids()));

-- Prevents cross-clinic access to patient vitals.
create policy vitals_select on vitals
  for select to authenticated
  using (clinic_id in (select user_clinic_ids()));

create policy vitals_insert on vitals
  for insert to authenticated
  with check (clinic_id in (select user_clinic_ids()));

create policy vitals_update on vitals
  for update to authenticated
  using (clinic_id in (select user_clinic_ids()))
  with check (clinic_id in (select user_clinic_ids()));

-- Prevents cross-clinic access to triage decisions.
create policy triage_results_select on triage_results
  for select to authenticated
  using (clinic_id in (select user_clinic_ids()));

create policy triage_results_insert on triage_results
  for insert to authenticated
  with check (clinic_id in (select user_clinic_ids()));

create policy triage_results_update on triage_results
  for update to authenticated
  using (clinic_id in (select user_clinic_ids()))
  with check (clinic_id in (select user_clinic_ids()));

-- No policy at all for anon/authenticated roles: share links carry access
-- to a patient's triage summary via an unauthenticated URL, so token
-- validation must happen only via the service role on the server, never
-- through a client-evaluated RLS predicate.

-- Prevents cross-clinic reads of the audit trail, and prevents anyone
-- (including clinic members) from altering or deleting audit history.
create policy audit_log_select on audit_log
  for select to authenticated
  using (clinic_id in (select user_clinic_ids()));

create policy audit_log_insert on audit_log
  for insert to authenticated
  with check (clinic_id in (select user_clinic_ids()));
