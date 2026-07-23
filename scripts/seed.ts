// Idempotent seed script: run with `npm run db:seed` from web/.
// Creates TWO clinics, each with four distinct patients (one waiting visit
// and one vitals row per patient, spanning clearly stable through clearly
// critical), and one operator auth user per clinic so RLS isolation between
// clinics can be exercised end-to-end (see scripts/rls-check.ts).
// Wipes any prior seed clinics/users before recreating, so re-running is safe.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../web/src/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedPasswordA = process.env.SEED_PASSWORD_A;
const seedPasswordB = process.env.SEED_PASSWORD_B;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
  process.exit(1);
}

if (!seedPasswordA || !seedPasswordB) {
  console.error(
    "Missing SEED_PASSWORD_A or SEED_PASSWORD_B in environment. Set both " +
      "before seeding — this script will not default to a hardcoded password.",
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

interface SeedClinic {
  name: string;
  operatorEmail: string;
  operatorPassword: string;
  patients: SeedPatient[];
}

const now = new Date().toISOString();

const clinicAPatients: SeedPatient[] = [
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
];

const clinicBPatients: SeedPatient[] = [
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

const seedClinics: SeedClinic[] = [
  {
    name: "Setu Seed Clinic A",
    operatorEmail: "operator-a@setu.test",
    operatorPassword: seedPasswordA,
    patients: clinicAPatients,
  },
  {
    name: "Setu Seed Clinic B",
    operatorEmail: "operator-b@setu.test",
    operatorPassword: seedPasswordB,
    patients: clinicBPatients,
  },
];

async function wipePriorClinic(clinicId: string): Promise<void> {
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

  const { error: membersErr } = await supabase
    .from("clinic_members")
    .delete()
    .eq("clinic_id", clinicId);
  if (membersErr) throw membersErr;

  const { error: clinicErr } = await supabase
    .from("clinics")
    .delete()
    .eq("id", clinicId);
  if (clinicErr) throw clinicErr;
}

async function deletePriorAuthUser(email: string): Promise<void> {
  // The admin API has no "get user by email" lookup, so page through all
  // users and match by email.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const match = data.users.find((u) => u.email === email);
    if (match) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(
        match.id,
      );
      if (delErr) throw delErr;
      return;
    }

    if (data.users.length < perPage) return;
    page += 1;
  }
}

async function seedOneClinic(seedClinic: SeedClinic): Promise<void> {
  const { data: existing, error: findErr } = await supabase
    .from("clinics")
    .select("id")
    .eq("name", seedClinic.name)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    console.log(`Removing prior seed data for clinic "${seedClinic.name}"...`);
    await wipePriorClinic(existing.id);
  }

  console.log(`Removing prior seed user "${seedClinic.operatorEmail}"...`);
  await deletePriorAuthUser(seedClinic.operatorEmail);

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .insert({ name: seedClinic.name })
    .select("id")
    .single();
  if (clinicErr) throw clinicErr;

  console.log(`Created clinic "${seedClinic.name}".`);

  for (const seedPatient of seedClinic.patients) {
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

    console.log(`Seeded ${seedPatient.full_name} in "${seedClinic.name}".`);
  }

  const { data: authUser, error: authErr } =
    await supabase.auth.admin.createUser({
      email: seedClinic.operatorEmail,
      password: seedClinic.operatorPassword,
      email_confirm: true,
    });
  if (authErr || !authUser?.user) {
    throw authErr ?? new Error("createUser returned no user");
  }

  const { error: memberErr } = await supabase.from("clinic_members").insert({
    user_id: authUser.user.id,
    clinic_id: clinic.id,
    role: "operator",
  });
  if (memberErr) throw memberErr;

  console.log(`Created operator user for "${seedClinic.name}".`);
}

async function main(): Promise<void> {
  for (const seedClinic of seedClinics) {
    await seedOneClinic(seedClinic);
  }

  console.log("\nDone. Seed credentials (test environment only):");
  for (const seedClinic of seedClinics) {
    console.log(
      `  ${seedClinic.name}: ${seedClinic.operatorEmail} / ${seedClinic.operatorPassword}`,
    );
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
