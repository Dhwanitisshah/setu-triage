// Idempotent seed script: run with `npm run db:seed` from web/.
// Wipes any prior seed data for SEED_CLINIC_NAME, then inserts one clinic,
// eight patients, one waiting visit each, and one vitals row each, spanning
// clearly stable through clearly critical. One patient has two vitals
// fields left NULL to exercise the missing-data path.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../web/src/types/database";

const SEED_CLINIC_NAME = "Setu Seed Clinic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedPatient {
  full_name: string;
  age: number;
  sex: "male" | "female" | "other";
  chief_complaint: string;
  vitals: Omit<
    Database["public"]["Tables"]["vitals"]["Insert"],
    "clinic_id" | "visit_id"
  >;
}

const now = new Date().toISOString();

const seedPatients: SeedPatient[] = [
  {
    full_name: "Asha Verma",
    age: 29,
    sex: "female",
    chief_complaint: "Routine follow-up, feeling well",
    vitals: {
      respiratory_rate: 16,
      spo2: 98,
      on_supplemental_oxygen: false,
      temperature_c: 36.8,
      systolic_bp: 118,
      pulse: 72,
      consciousness: "alert",
    },
  },
  {
    full_name: "Ravi Kumar",
    age: 41,
    sex: "male",
    chief_complaint: "Mild fever and sore throat",
    vitals: {
      respiratory_rate: 20,
      spo2: 96,
      on_supplemental_oxygen: false,
      temperature_c: 37.5,
      systolic_bp: 110,
      pulse: 88,
      consciousness: "alert",
    },
  },
  {
    full_name: "Meena Devi",
    age: 63,
    sex: "female",
    chief_complaint: "Productive cough, low-grade fever",
    vitals: {
      respiratory_rate: 22,
      spo2: 94,
      on_supplemental_oxygen: true,
      temperature_c: 38.2,
      systolic_bp: 100,
      pulse: 100,
      consciousness: "alert",
    },
  },
  {
    full_name: "Suresh Yadav",
    age: 57,
    sex: "male",
    chief_complaint: "Breathlessness, disoriented on arrival",
    vitals: {
      respiratory_rate: 24,
      spo2: 92,
      on_supplemental_oxygen: true,
      temperature_c: 38.9,
      systolic_bp: 95,
      pulse: 110,
      consciousness: "confusion",
    },
  },
  {
    full_name: "Priya Nair",
    age: 34,
    sex: "female",
    chief_complaint: "Severe abdominal pain, high fever",
    vitals: {
      respiratory_rate: 30,
      spo2: 85,
      on_supplemental_oxygen: true,
      temperature_c: 39.5,
      systolic_bp: 80,
      pulse: 130,
      consciousness: "voice",
    },
  },
  {
    full_name: "Deepak Singh",
    age: 71,
    sex: "male",
    chief_complaint: "Found unresponsive at home",
    vitals: {
      respiratory_rate: 8,
      spo2: 80,
      on_supplemental_oxygen: true,
      temperature_c: 35.0,
      systolic_bp: 70,
      pulse: 140,
      consciousness: "unresponsive",
    },
  },
  {
    full_name: "Farhan Sheikh",
    age: 45,
    sex: "male",
    chief_complaint: "Minor laceration, equipment unavailable for full vitals",
    vitals: {
      respiratory_rate: null,
      spo2: null,
      on_supplemental_oxygen: false,
      temperature_c: 37.0,
      systolic_bp: 120,
      pulse: 75,
      consciousness: "alert",
    },
  },
  {
    full_name: "Lakshmi Iyer",
    age: 52,
    sex: "female",
    chief_complaint: "Chest tightness, worsening pain",
    vitals: {
      respiratory_rate: 26,
      spo2: 90,
      on_supplemental_oxygen: false,
      temperature_c: 38.5,
      systolic_bp: 105,
      pulse: 115,
      consciousness: "pain",
    },
  },
];

async function wipePriorSeed(clinicId: string): Promise<void> {
  const { data: visits, error: visitsErr } = await supabase
    .from("visits")
    .select("id")
    .eq("clinic_id", clinicId);
  if (visitsErr) throw visitsErr;

  const visitIds = (visits ?? []).map((v: { id: string }) => v.id);
  if (visitIds.length > 0) {
    const { error: vitalsErr } = await supabase
      .from("vitals")
      .delete()
      .in("visit_id", visitIds);
    if (vitalsErr) throw vitalsErr;

    const { error: triageErr } = await supabase
      .from("triage_results")
      .delete()
      .in("visit_id", visitIds);
    if (triageErr) throw triageErr;

    const { error: delVisitsErr } = await supabase
      .from("visits")
      .delete()
      .eq("clinic_id", clinicId);
    if (delVisitsErr) throw delVisitsErr;
  }

  const { error: patientsErr } = await supabase
    .from("patients")
    .delete()
    .eq("clinic_id", clinicId);
  if (patientsErr) throw patientsErr;

  const { error: clinicErr } = await supabase
    .from("clinics")
    .delete()
    .eq("id", clinicId);
  if (clinicErr) throw clinicErr;
}

async function main(): Promise<void> {
  const { data: existing, error: findErr } = await supabase
    .from("clinics")
    .select("id")
    .eq("name", SEED_CLINIC_NAME)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    console.log(`Removing prior seed data for clinic "${SEED_CLINIC_NAME}"...`);
    await wipePriorSeed(existing.id);
  }

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .insert({ name: SEED_CLINIC_NAME })
    .select("id")
    .single();
  if (clinicErr) throw clinicErr;

  console.log(`Created clinic "${SEED_CLINIC_NAME}".`);

  for (const seedPatient of seedPatients) {
    const { data: patient, error: patientErr } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        full_name: seedPatient.full_name,
        age: seedPatient.age,
        sex: seedPatient.sex,
        consent_given_at: now,
      })
      .select("id")
      .single();
    if (patientErr) throw patientErr;

    const { data: visit, error: visitErr } = await supabase
      .from("visits")
      .insert({
        clinic_id: clinic.id,
        patient_id: patient.id,
        chief_complaint: seedPatient.chief_complaint,
        status: "waiting",
      })
      .select("id")
      .single();
    if (visitErr) throw visitErr;

    const { error: vitalsErr } = await supabase.from("vitals").insert({
      clinic_id: clinic.id,
      visit_id: visit.id,
      ...seedPatient.vitals,
    });
    if (vitalsErr) throw vitalsErr;

    console.log(`Seeded ${seedPatient.full_name}.`);
  }

  console.log(`Done. Seeded ${seedPatients.length} patients.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
