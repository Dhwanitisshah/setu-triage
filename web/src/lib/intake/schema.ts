// Validation and FormData->input mapping for the operator intake form
// (web/src/components/intake-form.tsx, web/src/app/(app)/intake/actions.ts).
// Deliberately pure and free of any server-only or Supabase import so it can
// be unit tested directly.
//
// docs/TRIAGE_BANDS.md §2.1: a missing vital must never be scored as normal.
// HTML number inputs emit "" when left blank, and Number("") is 0 — if that
// "" ever reached z.coerce.number() directly it would become 0, and a blank
// systolic BP would silently score as <=90 (3 points). Every numeric field
// below is preprocessed to map "" (and absent keys) to null BEFORE any
// coercion runs, and null is validated by its own branch in a union so it
// never reaches z.coerce.number() at all.
import { z } from "zod";
import type { AssessmentContext, Consciousness, VitalsInput } from "@/lib/triage/types";
import type { Sex } from "@/types/database";

const blankToNull = (val: unknown): unknown => (val === "" || val === undefined ? null : val);

const optionalNumber = z.preprocess(blankToNull, z.union([z.null(), z.coerce.number()]));

const optionalBoundedNumber = (min: number, max: number) =>
  z.preprocess(blankToNull, z.union([z.null(), z.coerce.number().min(min).max(max)]));

// A required numeric field read from a FormData string: the string must be
// non-empty before coercion runs, so a blank input fails as "required"
// rather than silently coercing "" to 0.
const requiredNumberFromString = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((val, ctx) => {
      const num = Number(val);
      if (Number.isNaN(num)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a number` });
        return z.NEVER;
      }
      return num;
    })
    .pipe(z.number().min(min, `${label} must be >= ${min}`).max(max, `${label} must be <= ${max}`));

const consciousnessValues = ["alert", "confusion", "voice", "pain", "unresponsive"] as const satisfies readonly Consciousness[];

const optionalConsciousness = z.preprocess(blankToNull, z.union([z.null(), z.enum(consciousnessValues)]));

const sexValues = ["male", "female", "other"] as const satisfies readonly Sex[];

// Tri-state yes/no/unknown -> boolean|null. Used for both
// hasSpinalCordInjury and onSupplementalOxygen: an unticked plain checkbox
// is indistinguishable from "no", but "not measured"/"unknown" is a
// distinct, real state that must not collapse into false.
const optionalTriBoolean = z
  .preprocess((val) => (val === "" || val === undefined ? "unknown" : val), z.enum(["yes", "no", "unknown"]))
  .transform((val): boolean | null => (val === "unknown" ? null : val === "yes"));

const existingPatientSchema = z.object({
  mode: z.literal("existing"),
  patientId: z.string().trim().min(1, "Select a patient"),
});

const newPatientSchema = z.object({
  mode: z.literal("new"),
  fullName: z.string().trim().min(1, "Full name is required"),
  age: requiredNumberFromString("Age", 0, 130),
  sex: z.enum(sexValues),
  consentGiven: z.boolean().refine((v) => v === true, {
    message: "Consent is required to register a new patient",
  }),
});

export const intakeFormSchema = z.object({
  patient: z.discriminatedUnion("mode", [existingPatientSchema, newPatientSchema]),
  chiefComplaint: z.preprocess(blankToNull, z.union([z.null(), z.string().trim().min(1)])),
  pregnancyWeeks: optionalBoundedNumber(0, 45),
  hasSpinalCordInjury: optionalTriBoolean,
  useScale2: z.boolean(),
  vitals: z.object({
    respiratoryRate: optionalNumber,
    spo2: optionalNumber,
    onSupplementalOxygen: optionalTriBoolean,
    temperatureC: optionalNumber,
    systolicBp: optionalNumber,
    pulse: optionalNumber,
    consciousness: optionalConsciousness,
  }),
});

export type IntakeFormInput = z.infer<typeof intakeFormSchema>;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// Builds the raw (pre-validation) shape from a FormData submission. This is
// also the enforcement point for "clinic_id from the client is ignored": no
// clinic/clinicId field is ever read here, so nothing the client submits
// under that name can reach validation, the rules engine, or a database
// write — clinic_id is resolved server-side from the signed-in user's
// membership in actions.ts instead.
export function intakeFormDataToRawInput(formData: FormData): unknown {
  const patientMode = readString(formData, "patientMode");

  return {
    patient:
      patientMode === "new"
        ? {
            mode: "new",
            fullName: readString(formData, "fullName"),
            age: readString(formData, "age"),
            sex: readString(formData, "sex"),
            consentGiven: formData.get("consentGiven") === "on",
          }
        : {
            mode: "existing",
            patientId: readString(formData, "patientId"),
          },
    chiefComplaint: readString(formData, "chiefComplaint"),
    pregnancyWeeks: readString(formData, "pregnancyWeeks"),
    hasSpinalCordInjury: readString(formData, "hasSpinalCordInjury"),
    useScale2: formData.get("useScale2") === "on",
    vitals: {
      respiratoryRate: readString(formData, "respiratoryRate"),
      spo2: readString(formData, "spo2"),
      onSupplementalOxygen: readString(formData, "onSupplementalOxygen"),
      temperatureC: readString(formData, "temperatureC"),
      systolicBp: readString(formData, "systolicBp"),
      pulse: readString(formData, "pulse"),
      consciousness: readString(formData, "consciousness"),
    },
  };
}

export function parseIntakeForm(formData: FormData) {
  return intakeFormSchema.safeParse(intakeFormDataToRawInput(formData));
}

export function toVitalsInput(vitals: IntakeFormInput["vitals"]): VitalsInput {
  return {
    respiratoryRate: vitals.respiratoryRate,
    spo2: vitals.spo2,
    onSupplementalOxygen: vitals.onSupplementalOxygen,
    systolicBp: vitals.systolicBp,
    pulse: vitals.pulse,
    consciousness: vitals.consciousness,
    temperature: vitals.temperatureC,
  };
}

export function toAssessmentContext(input: IntakeFormInput, age: number | null): AssessmentContext {
  return {
    age,
    pregnancyWeeks: input.pregnancyWeeks,
    hasSpinalCordInjury: input.hasSpinalCordInjury,
    useScale2: input.useScale2,
  };
}
