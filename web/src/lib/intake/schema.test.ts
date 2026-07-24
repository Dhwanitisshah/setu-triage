import { describe, expect, it } from "vitest";
import { assess } from "@/lib/triage/rules-engine";
import {
  intakeFormDataToRawInput,
  parseIntakeForm,
  toAssessmentContext,
  toVitalsInput,
} from "./schema";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    patientMode: "existing",
    patientId: "11111111-1111-1111-1111-111111111111",
    chiefComplaint: "Fever",
    pregnancyWeeks: "",
    hasSpinalCordInjury: "",
    respiratoryRate: "16",
    spo2: "98",
    onSupplementalOxygen: "no",
    temperatureC: "37.0",
    systolicBp: "120",
    pulse: "70",
    consciousness: "alert",
    ...overrides,
  };

  const formData = new FormData();
  for (const [key, value] of Object.entries(base)) {
    formData.set(key, value);
  }
  // Checkbox-style fields are only present in real FormData when checked.
  if (overrides.useScale2 === "on") formData.set("useScale2", "on");
  if (overrides.consentGiven === "on") formData.set("consentGiven", "on");
  return formData;
}

describe("parseIntakeForm - all vitals blank", () => {
  it("produces 7 missing parameters and a score reflecting no parameters, never a score built from zeros", () => {
    const formData = buildFormData({
      respiratoryRate: "",
      spo2: "",
      onSupplementalOxygen: "",
      temperatureC: "",
      systolicBp: "",
      pulse: "",
      consciousness: "",
    });

    const result = parseIntakeForm(formData);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const vitals = toVitalsInput(result.data.vitals);
    expect(vitals).toEqual({
      respiratoryRate: null,
      spo2: null,
      onSupplementalOxygen: null,
      systolicBp: null,
      pulse: null,
      consciousness: null,
      temperature: null,
    });

    const context = toAssessmentContext(result.data, 40);
    const assessment = assess(vitals, context);

    expect(assessment.missingParameters).toHaveLength(7);
    // 0, because nothing was scored — not because a blank systolic BP (<=90
    // => 3), temperature (<=35.0 => 3), or respiration rate (<=8 => 3) was
    // silently coerced from "" into a real value and scored as abnormal.
    expect(assessment.news2Score).toBe(0);
    expect(assessment.requiresManualReview).toBe(true);
  });
});

describe("parseIntakeForm - blank string coercion per numeric field", () => {
  const numericFields = [
    "respiratoryRate",
    "spo2",
    "temperatureC",
    "systolicBp",
    "pulse",
  ] as const;

  for (const field of numericFields) {
    it(`"" on ${field} coerces to null, not 0`, () => {
      const result = parseIntakeForm(buildFormData({ [field]: "" }));
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.vitals[field]).toBeNull();
    });
  }

  it('"" on pregnancyWeeks coerces to null, not 0', () => {
    const result = parseIntakeForm(buildFormData({ pregnancyWeeks: "" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.pregnancyWeeks).toBeNull();
  });
});

describe("intakeFormDataToRawInput - clinic_id from the client is ignored", () => {
  it("never reads a clinicId/clinic_id field, even when present in the submission", () => {
    const formData = buildFormData();
    formData.set("clinicId", "attacker-supplied-clinic");
    formData.set("clinic_id", "attacker-supplied-clinic");

    const raw = intakeFormDataToRawInput(formData);
    expect(raw).not.toHaveProperty("clinicId");
    expect(raw).not.toHaveProperty("clinic_id");

    const result = parseIntakeForm(formData);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty("clinicId");
    expect(result.data).not.toHaveProperty("clinic_id");
  });
});

describe("parseIntakeForm - new patient consent", () => {
  function newPatientFormData(overrides: Record<string, string> = {}): FormData {
    return buildFormData({
      patientMode: "new",
      fullName: "Test Patient",
      age: "30",
      sex: "female",
      ...overrides,
    });
  }

  it("consent unticked blocks new-patient creation", () => {
    const result = parseIntakeForm(newPatientFormData());
    expect(result.success).toBe(false);
    if (result.success) return;
    const flat = result.error.flatten();
    expect(JSON.stringify(flat)).toContain("Consent is required");
  });

  it("consent ticked allows new-patient creation", () => {
    const result = parseIntakeForm(newPatientFormData({ consentGiven: "on" }));
    expect(result.success).toBe(true);
  });
});

describe("parseIntakeForm - tri-state spinal cord injury", () => {
  it('blank maps to null ("unknown"), not false', () => {
    const result = parseIntakeForm(buildFormData({ hasSpinalCordInjury: "" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hasSpinalCordInjury).toBeNull();
  });

  it('"no" maps to false', () => {
    const result = parseIntakeForm(buildFormData({ hasSpinalCordInjury: "no" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hasSpinalCordInjury).toBe(false);
  });

  it('"yes" maps to true', () => {
    const result = parseIntakeForm(buildFormData({ hasSpinalCordInjury: "yes" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hasSpinalCordInjury).toBe(true);
  });
});
