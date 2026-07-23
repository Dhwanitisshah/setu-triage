// Hand-written types mirroring supabase/migrations/0001_init.sql.
// Keep in sync with the migration by hand — there is no codegen step yet.

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

export interface ClinicRow {
  id: string;
  name: string;
  created_at: string;
}

export interface ClinicMemberRow {
  user_id: string;
  clinic_id: string;
  role: ClinicRole;
  created_at: string;
}

export interface PatientRow {
  id: string;
  clinic_id: string;
  full_name: string;
  age: number | null;
  sex: Sex | null;
  consent_given_at: string;
  consent_withdrawn_at: string | null;
  created_at: string;
}

export interface VisitRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  arrived_at: string;
  chief_complaint: string | null;
  status: VisitStatus;
  created_at: string;
}

export interface VitalsRow {
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
}

export interface TriageResultRow {
  id: string;
  clinic_id: string;
  visit_id: string;
  band: TriageBand;
  decided_by: DecidedBy;
  news2_score: number | null;
  rules_triggered: unknown[];
  model_score: number | null;
  model_version: string | null;
  rationale: string | null;
  requires_manual_review: boolean;
  created_at: string;
}

export interface ShareLinkRow {
  id: string;
  clinic_id: string;
  visit_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  clinic_id: string | null;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface QueueRow {
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
}

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: ClinicRow;
        Insert: Partial<Omit<ClinicRow, "id" | "created_at">> &
          Pick<ClinicRow, "name">;
        Update: Partial<ClinicRow>;
      };
      clinic_members: {
        Row: ClinicMemberRow;
        Insert: Partial<Omit<ClinicMemberRow, "created_at">> &
          Pick<ClinicMemberRow, "user_id" | "clinic_id" | "role">;
        Update: Partial<ClinicMemberRow>;
      };
      patients: {
        Row: PatientRow;
        Insert: Partial<Omit<PatientRow, "id" | "created_at">> &
          Pick<PatientRow, "clinic_id" | "full_name" | "consent_given_at">;
        Update: Partial<PatientRow>;
      };
      visits: {
        Row: VisitRow;
        Insert: Partial<Omit<VisitRow, "id" | "created_at">> &
          Pick<VisitRow, "clinic_id" | "patient_id">;
        Update: Partial<VisitRow>;
      };
      vitals: {
        Row: VitalsRow;
        Insert: Partial<Omit<VitalsRow, "id" | "created_at">> &
          Pick<VitalsRow, "clinic_id" | "visit_id">;
        Update: Partial<VitalsRow>;
      };
      triage_results: {
        Row: TriageResultRow;
        Insert: Partial<Omit<TriageResultRow, "id" | "created_at">> &
          Pick<TriageResultRow, "clinic_id" | "visit_id" | "band" | "decided_by">;
        Update: Partial<TriageResultRow>;
      };
      share_links: {
        Row: ShareLinkRow;
        Insert: Partial<Omit<ShareLinkRow, "id" | "created_at">> &
          Pick<ShareLinkRow, "clinic_id" | "visit_id" | "token_hash" | "expires_at">;
        Update: Partial<ShareLinkRow>;
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: Partial<Omit<AuditLogRow, "id" | "created_at">> &
          Pick<AuditLogRow, "actor" | "action" | "entity">;
        Update: Partial<AuditLogRow>;
      };
    };
    Views: {
      v_queue: {
        Row: QueueRow;
      };
    };
  };
}
