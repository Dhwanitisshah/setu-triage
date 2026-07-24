"use client";

import { useActionState, useState } from "react";
import {
  initialIntakeActionState,
  submitIntake,
  type IntakeActionState,
} from "@/app/(app)/intake/actions";

type ExistingPatient = {
  id: string;
  full_name: string;
  age: number | null;
};

const inputClass =
  "rounded border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2]";
const labelClass = "flex flex-col gap-1 text-sm";
const fieldErrorClass = "text-xs text-red-600";

function FieldErrors({ state, name }: { state: IntakeActionState; name: string }) {
  if (state.status !== "error") return null;
  const errors = state.fieldErrors[name];
  if (!errors || errors.length === 0) return null;
  return (
    <>
      {errors.map((message) => (
        <p key={message} className={fieldErrorClass}>
          {message}
        </p>
      ))}
    </>
  );
}

export function IntakeForm({ existingPatients }: { existingPatients: ExistingPatient[] }) {
  const [state, formAction, pending] = useActionState<IntakeActionState, FormData>(
    submitIntake,
    initialIntakeActionState,
  );
  const [patientMode, setPatientMode] = useState<"existing" | "new">(
    existingPatients.length > 0 ? "existing" : "new",
  );

  if (state.status === "success") {
    return <IntakeResult state={state} />;
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold">Patient intake</h1>

      {state.status === "error" && state.formError && (
        <p className="text-sm text-red-600">{state.formError}</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Patient</h2>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="patientMode"
              value="existing"
              checked={patientMode === "existing"}
              onChange={() => setPatientMode("existing")}
              disabled={existingPatients.length === 0}
            />
            Existing patient
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="patientMode"
              value="new"
              checked={patientMode === "new"}
              onChange={() => setPatientMode("new")}
            />
            New patient
          </label>
        </div>

        {patientMode === "existing" ? (
          <label className={labelClass}>
            Select patient (this clinic only)
            <select name="patientId" className={inputClass} defaultValue="">
              <option value="" disabled>
                Choose a patient…
              </option>
              {existingPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.age !== null ? ` (${p.age})` : ""}
                </option>
              ))}
            </select>
            <FieldErrors state={state} name="patient" />
          </label>
        ) : (
          <div className="flex flex-col gap-3">
            <label className={labelClass}>
              Full name
              <input type="text" name="fullName" className={inputClass} />
            </label>
            <label className={labelClass}>
              Age
              <input type="number" name="age" min={0} max={130} className={inputClass} />
            </label>
            <label className={labelClass}>
              Sex
              <select name="sex" className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="consentGiven" />
              Patient has given consent to register and store their information
            </label>
            <FieldErrors state={state} name="patient" />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Visit</h2>

        <label className={labelClass}>
          Chief complaint (optional)
          <input type="text" name="chiefComplaint" className={inputClass} />
        </label>

        <label className={labelClass}>
          Weeks pregnant (optional, leave blank if not applicable/unknown)
          <input
            type="number"
            name="pregnancyWeeks"
            min={0}
            max={45}
            className={inputClass}
          />
          <FieldErrors state={state} name="pregnancyWeeks" />
        </label>

        <TriStateField
          label="Spinal cord injury"
          name="hasSpinalCordInjury"
          state={state}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Vitals</h2>
        <p className="text-xs text-black/60 dark:text-white/60">
          Leave any vital blank if it was not measured — do not enter 0.
        </p>
        <FieldErrors state={state} name="vitals" />

        <NumberField label="Respiratory rate (breaths/min)" name="respiratoryRate" state={state} />
        <NumberField label="SpO2 (%)" name="spo2" state={state} />
        <TriStateField
          label="On supplemental oxygen"
          name="onSupplementalOxygen"
          state={state}
        />
        <NumberField label="Temperature (°C)" name="temperatureC" step="0.1" state={state} />
        <NumberField label="Systolic BP (mmHg)" name="systolicBp" state={state} />
        <NumberField label="Pulse (bpm)" name="pulse" state={state} />

        <label className={labelClass}>
          Consciousness (ACVPU)
          <select name="consciousness" className={inputClass} defaultValue="">
            <option value="">Not measured</option>
            <option value="alert">Alert</option>
            <option value="confusion">Confusion</option>
            <option value="voice">Voice</option>
            <option value="pain">Pain</option>
            <option value="unresponsive">Unresponsive</option>
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="useScale2" />
          Use SpO2 Scale 2
        </label>
        <p className="text-xs text-black/60 dark:text-white/60">
          Only for patients with confirmed hypercapnic respiratory failure, under a
          clinician&apos;s direction. Leave off by default.
        </p>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit intake"}
      </button>
    </form>
  );
}

function NumberField({
  label,
  name,
  state,
  step,
}: {
  label: string;
  name: string;
  state: IntakeActionState;
  step?: string;
}) {
  return (
    <label className={labelClass}>
      {label} <span className="text-black/50 dark:text-white/50">(leave blank if not measured)</span>
      <input type="number" name={name} step={step} className={inputClass} />
      <FieldErrors state={state} name={name} />
    </label>
  );
}

function TriStateField({
  label,
  name,
  state,
}: {
  label: string;
  name: string;
  state: IntakeActionState;
}) {
  return (
    <label className={labelClass}>
      {label}
      <select name={name} className={inputClass} defaultValue="unknown">
        <option value="unknown">Not known / not measured</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <FieldErrors state={state} name={name} />
    </label>
  );
}

function IntakeResult({
  state,
}: {
  state: Extract<IntakeActionState, { status: "success" }>;
}) {
  const { assessment } = state;
  const bandLabel = assessment.band ?? "needs manual triage";

  return (
    <div className="flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-lg font-semibold">Visit recorded</h1>

      <div className="flex flex-col gap-1 text-sm">
        <p>
          Band: <span className="font-medium">{bandLabel}</span>
          {assessment.band === null && (
            <span className="text-black/60 dark:text-white/60">
              {" "}
              — not a severity, this patient needs manual triage
            </span>
          )}
        </p>
        <p>
          NEWS2 score:{" "}
          <span className="font-medium">
            {assessment.news2Score === null ? "not scored" : assessment.news2Score}
          </span>
          {assessment.isPartialScore && (
            <span className="ml-2 rounded bg-yellow-200 px-1.5 py-0.5 text-xs font-medium text-yellow-900">
              partial score — missing parameters
            </span>
          )}
        </p>
        {assessment.requiresManualReview && (
          <p className="font-medium text-yellow-700 dark:text-yellow-400">
            Requires manual review
          </p>
        )}
      </div>

      {assessment.missingParameters.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Missing parameters</p>
          <ul className="list-inside list-disc">
            {assessment.missingParameters.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm">
        <p className="font-medium">Rules triggered</p>
        <ul className="list-inside list-disc">
          {assessment.rulesTriggered.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      {assessment.caveats.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Caveats</p>
          <ul className="list-inside list-disc">
            {assessment.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
