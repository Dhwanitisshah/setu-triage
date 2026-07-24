"use server";

// Server action for the operator intake form. Uses the RLS-active rsc
// client exclusively — never the service-role client — so every write is
// still constrained by the same clinic-membership policies a browser
// request would be, even though this code runs on the server.
import { getCurrentUser, getUserClinics } from "@/lib/auth";
import {
  parseIntakeForm,
  toAssessmentContext,
  toVitalsInput,
  type IntakeFormInput,
} from "@/lib/intake/schema";
import { createSupabaseRscClient } from "@/lib/supabase/rsc";
import { assess } from "@/lib/triage/rules-engine";
import type { IntakeActionState } from "./action-state";

function errorState(formError: string, fieldErrors: Record<string, string[]> = {}): IntakeActionState {
  return { status: "error", formError, fieldErrors };
}

async function resolvePatient(
  patient: IntakeFormInput["patient"],
  clinicId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseRscClient>>,
): Promise<
  | { ok: true; patientId: string; age: number | null; rollback: (() => Promise<void>) | null }
  | { ok: false; error: string }
> {
  if (patient.mode === "existing") {
    const { data, error } = await supabase
      .from("patients")
      .select("id, age")
      .eq("id", patient.patientId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Patient not found in your clinic." };

    return { ok: true, patientId: data.id, age: data.age, rollback: null };
  }

  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      full_name: patient.fullName,
      age: patient.age,
      sex: patient.sex,
      consent_given_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    patientId: data.id,
    age: patient.age,
    rollback: async () => {
      await supabase.from("patients").delete().eq("id", data.id);
    },
  };
}

export async function submitIntake(
  _prevState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  const user = await getCurrentUser();
  if (!user) return errorState("You must be signed in to record a visit.");

  const clinics = await getUserClinics();
  if (clinics.length === 0) return errorState("Your account is not a member of any clinic.");
  const clinicId = clinics[0].clinicId;

  const parsed = parseIntakeForm(formData);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    return errorState("Please fix the highlighted fields.", flattened.fieldErrors as Record<string, string[]>);
  }
  const input = parsed.data;

  const supabase = await createSupabaseRscClient();
  const rollbackActions: Array<() => Promise<void>> = [];

  async function rollbackAll(): Promise<void> {
    for (const action of rollbackActions.slice().reverse()) {
      await action().catch(() => {});
    }
  }

  const patientResult = await resolvePatient(input.patient, clinicId, supabase);
  if (!patientResult.ok) return errorState(patientResult.error);
  const { patientId, age } = patientResult;
  if (patientResult.rollback) rollbackActions.push(patientResult.rollback);

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      chief_complaint: input.chiefComplaint,
      pregnancy_weeks: input.pregnancyWeeks,
      has_spinal_cord_injury: input.hasSpinalCordInjury,
    })
    .select("id")
    .single();

  if (visitError || !visit) {
    await rollbackAll();
    return errorState(visitError?.message ?? "Failed to record the visit.");
  }
  const visitId: string = visit.id;
  rollbackActions.push(async () => {
    await supabase.from("visits").delete().eq("id", visitId);
  });

  const vitalsInput = toVitalsInput(input.vitals);
  const { error: vitalsError } = await supabase.from("vitals").insert({
    clinic_id: clinicId,
    visit_id: visitId,
    respiratory_rate: vitalsInput.respiratoryRate,
    spo2: vitalsInput.spo2,
    on_supplemental_oxygen: vitalsInput.onSupplementalOxygen,
    temperature_c: vitalsInput.temperature,
    systolic_bp: vitalsInput.systolicBp,
    pulse: vitalsInput.pulse,
    consciousness: vitalsInput.consciousness,
  });

  if (vitalsError) {
    await rollbackAll();
    return errorState(vitalsError.message);
  }

  const context = toAssessmentContext(input, age);
  const assessment = assess(vitalsInput, context);
  const rationale = assessment.rulesTriggered.join("; ") || null;

  const { data: triageResult, error: triageError } = await supabase
    .from("triage_results")
    .insert({
      clinic_id: clinicId,
      visit_id: visitId,
      band: assessment.band,
      decided_by: "rules",
      news2_score: assessment.news2Score,
      is_partial_score: assessment.isPartialScore,
      rules_triggered: assessment.rulesTriggered,
      requires_manual_review: assessment.requiresManualReview,
      rationale,
    })
    .select("id")
    .single();

  if (triageError || !triageResult) {
    await rollbackAll();
    return errorState(triageError?.message ?? "Failed to record the triage result.");
  }

  const { error: auditError } = await supabase.from("audit_log").insert({
    clinic_id: clinicId,
    actor: user.id,
    action: "triage.assess",
    entity: "triage_results",
    entity_id: triageResult.id,
    payload: {
      inputs: { vitals: vitalsInput, context, chiefComplaint: input.chiefComplaint },
      band: assessment.band,
    },
  });

  if (auditError) {
    await supabase.from("triage_results").delete().eq("id", triageResult.id);
    await rollbackAll();
    return errorState(auditError.message);
  }

  return { status: "success", visitId, assessment };
}
