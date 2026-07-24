// Hand-written types mirroring supabase/migrations/0001_init.sql.
// Keep in sync with the migration by hand — there is no codegen step yet.
//
// Row/Insert/Update shapes must be `type` aliases (object type literals),
// not `interface` declarations: only object type literals get TypeScript's
// implicit string index signature, which is what makes them structurally
// assignable to `Record<string, unknown>` — the constraint Supabase's
// `GenericTable` requires. An `interface` here silently fails that check
// and collapses every `.from(...)` call's inferred type to `never`.

export type TriageBand = "green" | "yellow" | "red";

export type ClinicRole = "operator" | "doctor" | "admin";

export type Sex = "male" | "female" | "other";

export type VisitStatus = "waiting" | "in_consult" | "done";

export type Consciousness =
  | "alert"
  | "confusion"
  | "voice"
  | "pain"
  | "unresponsive";

export type DecidedBy = "rules" | "model" | "manual";

export type ClinicRow = {
  id: string;
  name: string;
  created_at: string;
};

export type ClinicMemberRow = {
  user_id: string;
  clinic_id: string;
  role: ClinicRole;
  created_at: string;
};

export type PatientRow = {
  id: string;
  clinic_id: string;
  full_name: string;
  age: number | null;
  sex: Sex | null;
  consent_given_at: string;
  consent_withdrawn_at: string | null;
  created_at: string;
};

export type VisitRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  arrived_at: string;
  chief_complaint: string | null;
  status: VisitStatus;
  /** null = not pregnant or unknown. docs/TRIAGE_BANDS.md §2.3/§3. */
  pregnancy_weeks: number | null;
  /** null = unknown, not "no". docs/TRIAGE_BANDS.md §3. */
  has_spinal_cord_injury: boolean | null;
  created_at: string;
};

export type VitalsRow = {
  id: string;
  clinic_id: string;
  visit_id: string;
  respiratory_rate: number | null;
  spo2: number | null;
  on_supplemental_oxygen: boolean | null;
  temperature_c: number | null;
  systolic_bp: number | null;
  pulse: number | null;
  consciousness: Consciousness | null;
  recorded_at: string;
  created_at: string;
};

export type TriageResultRow = {
  id: string;
  clinic_id: string;
  visit_id: string;
  band: TriageBand | null;
  decided_by: DecidedBy;
  news2_score: number | null;
  rules_triggered: unknown[];
  model_score: number | null;
  model_version: string | null;
  rationale: string | null;
  requires_manual_review: boolean;
  created_at: string;
};

export type ShareLinkRow = {
  id: string;
  clinic_id: string;
  visit_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  clinic_id: string | null;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type QueueRow = {
  visit_id: string;
  clinic_id: string;
  full_name: string;
  age: number | null;
  sex: Sex | null;
  chief_complaint: string | null;
  arrived_at: string;
  band: TriageBand | null;
  news2_score: number | null;
  requires_manual_review: boolean | null;
};

export type Database = {
  public: {
    Tables: {
      clinics: {
        Row: ClinicRow;
        Insert: Partial<Omit<ClinicRow, "id" | "created_at">> &
          Pick<ClinicRow, "name">;
        Update: Partial<ClinicRow>;
        Relationships: [];
      };
      clinic_members: {
        Row: ClinicMemberRow;
        Insert: Partial<Omit<ClinicMemberRow, "created_at">> &
          Pick<ClinicMemberRow, "user_id" | "clinic_id" | "role">;
        Update: Partial<ClinicMemberRow>;
        Relationships: [];
      };
      patients: {
        Row: PatientRow;
        Insert: Partial<Omit<PatientRow, "id" | "created_at">> &
          Pick<PatientRow, "clinic_id" | "full_name" | "consent_given_at">;
        Update: Partial<PatientRow>;
        Relationships: [];
      };
      visits: {
        Row: VisitRow;
        Insert: Partial<Omit<VisitRow, "id" | "created_at">> &
          Pick<VisitRow, "clinic_id" | "patient_id">;
        Update: Partial<VisitRow>;
        Relationships: [];
      };
      vitals: {
        Row: VitalsRow;
        Insert: Partial<Omit<VitalsRow, "id" | "created_at">> &
          Pick<VitalsRow, "clinic_id" | "visit_id">;
        Update: Partial<VitalsRow>;
        Relationships: [];
      };
      triage_results: {
        Row: TriageResultRow;
        Insert: Partial<Omit<TriageResultRow, "id" | "created_at">> &
          Pick<TriageResultRow, "clinic_id" | "visit_id" | "band" | "decided_by">;
        Update: Partial<TriageResultRow>;
        Relationships: [];
      };
      share_links: {
        Row: ShareLinkRow;
        Insert: Partial<Omit<ShareLinkRow, "id" | "created_at">> &
          Pick<ShareLinkRow, "clinic_id" | "visit_id" | "token_hash" | "expires_at">;
        Update: Partial<ShareLinkRow>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: Partial<Omit<AuditLogRow, "id" | "created_at">> &
          Pick<AuditLogRow, "actor" | "action" | "entity">;
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
    };
    Views: {
      v_queue: {
        Row: QueueRow;
        Relationships: [];
      };
    };
    Functions: {
      views_missing_security_invoker: {
        Args: Record<string, never>;
        Returns: string[];
      };
    };
  };
};
